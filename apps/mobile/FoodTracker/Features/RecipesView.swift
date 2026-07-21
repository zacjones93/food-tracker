import SwiftUI

struct RecipesView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(ConnectivityMonitor.self) private var connectivity
    @State private var search = ""
    @State private var mealType = "All"
    @State private var showingNewRecipe = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: FoodSpacing.large) {
                ScreenHeaderWithStatus(
                    eyebrow: "Cook from what you know",
                    title: "Recipes",
                    detail: "Your shared cookbook, available even without a signal.",
                    pendingCount: store.pendingCount,
                    isOnline: connectivity.isOnline,
                    isSyncing: store.isSyncing,
                    isLoading: store.isInitialLoading || store.isRefreshing
                )

                if store.isInitialLoading {
                    VStack(alignment: .leading, spacing: FoodSpacing.large) {
                        FoodSkeleton(width: 118, height: 34)
                        FoodListSkeleton(accessibilityLabel: "Loading recipes", rowCount: 5)
                            .foodSurface()
                    }
                } else {
                    Picker("Meal type", selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { Text($0) }
                    }
                    .pickerStyle(.menu)

                    if filteredRecipes.isEmpty {
                        FoodEmptyState(
                            symbol: search.isEmpty ? "book.closed" : "magnifyingglass",
                            title: search.isEmpty ? "Your cookbook is waiting" : "No matching recipes",
                            detail: search.isEmpty ? "Save the meals you want to make again." : "Try another name, tag, or meal type.",
                            actionTitle: search.isEmpty ? "Add recipe" : nil,
                            action: search.isEmpty ? { showingNewRecipe = true } : nil
                        )
                        .frame(minHeight: 360)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(filteredRecipes) { recipe in
                                NavigationLink {
                                    RecipeDetailView(recipeID: recipe.id)
                                } label: {
                                    RecipeRow(recipe: recipe, trailingText: recipe.mealsEatenCount == 0 ? nil : "Made \(recipe.mealsEatenCount)×")
                                        .padding(.horizontal, FoodSpacing.medium)
                                        .padding(.vertical, FoodSpacing.small)
                                }
                                .buttonStyle(.plain)
                                if recipe.id != filteredRecipes.last?.id { Divider().padding(.leading, 72) }
                            }
                        }
                        .foodSurface()
                    }
                }
            }
            .padding(.horizontal, FoodSpacing.medium)
            .padding(.vertical, FoodSpacing.large)
        }
        .background(Color.foodPaper)
        .navigationTitle("Recipes")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Name or tag")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add recipe", systemImage: "plus") { showingNewRecipe = true }
            }
        }
        .sheet(isPresented: $showingNewRecipe) { RecipeEditor() }
    }

    private var mealTypes: [String] {
        ["All"] + Array(Set(store.recipes.map(\.mealType).filter { !$0.isEmpty })).sorted()
    }

    private var filteredRecipes: [Recipe] {
        store.recipes.filter { recipe in
            let matchesType = mealType == "All" || recipe.mealType == mealType
            let matchesSearch = search.isEmpty || recipe.name.localizedCaseInsensitiveContains(search) || recipe.tags.contains {
                $0.localizedCaseInsensitiveContains(search)
            }
            return matchesType && matchesSearch
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

struct RecipeEditor: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var recipe: Recipe?
    @State private var name: String
    @State private var emoji: String
    @State private var mealType: String
    @State private var difficulty: String
    @State private var visibility: String
    @State private var tags: String
    @State private var recipeLink: String
    @State private var recipeBookID: String?
    @State private var page: String
    @State private var ingredients: String
    @State private var instructions: String

    init(recipe: Recipe? = nil) {
        self.recipe = recipe
        _name = State(initialValue: recipe?.name ?? "")
        _emoji = State(initialValue: recipe?.emoji ?? "🍽️")
        _mealType = State(initialValue: recipe?.mealType ?? "Dinner")
        _difficulty = State(initialValue: recipe?.difficulty ?? "Easy")
        _visibility = State(initialValue: recipe?.visibility ?? "private")
        _tags = State(initialValue: recipe?.tags.joined(separator: ", ") ?? "")
        _recipeLink = State(initialValue: recipe?.recipeLink ?? "")
        _recipeBookID = State(initialValue: recipe?.recipeBookID)
        _page = State(initialValue: recipe?.page ?? "")
        _ingredients = State(initialValue: recipe?.ingredients.flatMap(\.items).joined(separator: "\n") ?? "")
        _instructions = State(initialValue: recipe?.instructions ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    TextField("Name", text: $name)
                    TextField("Emoji", text: $emoji)
                    Picker("Meal", selection: $mealType) {
                        ForEach(["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"], id: \.self) { Text($0) }
                    }
                    Picker("Difficulty", selection: $difficulty) {
                        ForEach(["Easy", "Medium", "Hard"], id: \.self) { Text($0) }
                    }
                    TextField("Tags, separated by commas", text: $tags)
                }
                Section("Ingredients") {
                    TextEditor(text: $ingredients)
                        .frame(minHeight: 150)
                    Text("Put one ingredient on each line.")
                        .font(.caption).foregroundStyle(Color.foodSecondaryInk)
                }
                Section("Instructions") {
                    TextEditor(text: $instructions)
                        .frame(minHeight: 180)
                    Text("Markdown formatting is supported.")
                        .font(.caption)
                        .foregroundStyle(Color.foodSecondaryInk)
                }
                Section("Source") {
                    TextField("Recipe link", text: $recipeLink)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Picker("Recipe book", selection: $recipeBookID) {
                        Text("None").tag(nil as String?)
                        ForEach(store.recipeBooks) { Text($0.name).tag($0.id as String?) }
                    }
                    if recipeBookID != nil { TextField("Page", text: $page) }
                }
                Section("Sharing") {
                    Picker("Visibility", selection: $visibility) {
                        Text("Team only").tag("private")
                        Text("Public").tag("public")
                        Text("Unlisted").tag("unlisted")
                    }
                }
            }
            .foodListBackground()
            .foodFormBehavior()
            .navigationTitle(recipe == nil ? "New recipe" : "Edit recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var value = recipe ?? Recipe(name: name)
                        value.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        value.emoji = emoji.isEmpty ? "🍽️" : emoji
                        value.mealType = mealType
                        value.difficulty = difficulty
                        value.visibility = visibility
                        value.tags = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                        value.recipeLink = recipeLink
                        value.recipeBookID = recipeBookID
                        value.page = page
                        value.ingredients = [IngredientSection(
                            title: "Ingredients",
                            items: ingredients.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.isEmpty }
                        )]
                        value.instructions = instructions
                        store.saveRecipe(value)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
