import SwiftUI

struct RecipesView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(ConnectivityMonitor.self) private var connectivity
    @State private var search = ""
    @State private var mealType = "All"
    @State private var sort = RecipeSort.nameAscending
    @State private var showingNewRecipe = false
    @State private var pagination = RecipeListPagination()

    var body: some View {
        let matchingRecipes = filteredRecipes
        let visibleRecipes = pagination.visibleItems(from: matchingRecipes)

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
                    HStack(spacing: FoodSpacing.small) {
                        Picker("Meal type", selection: $mealType) {
                            ForEach(mealTypes, id: \.self) { Text($0) }
                        }
                        .pickerStyle(.menu)

                        Spacer(minLength: FoodSpacing.small)

                        Picker("Sort recipes", selection: $sort) {
                            ForEach(RecipeSort.allCases) { option in
                                Label(option.title, systemImage: option.systemImage)
                                    .tag(option)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    if matchingRecipes.isEmpty {
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
                            ForEach(visibleRecipes) { recipe in
                                NavigationLink {
                                    RecipeDetailView(recipeID: recipe.id)
                                } label: {
                                    RecipeRow(recipe: recipe, trailingText: recipe.mealsEatenCount == 0 ? nil : "Made \(recipe.mealsEatenCount)×")
                                        .padding(.horizontal, FoodSpacing.medium)
                                        .padding(.vertical, FoodSpacing.small)
                                }
                                .buttonStyle(.plain)
                                if recipe.id != visibleRecipes.last?.id { Divider().padding(.leading, 72) }
                            }

                            if pagination.hasMore(totalCount: matchingRecipes.count) {
                                Divider().padding(.leading, 72)
                                Button {
                                    pagination.loadNextPage(totalCount: matchingRecipes.count)
                                } label: {
                                    HStack {
                                        Text("Load more recipes")
                                        Spacer()
                                        Text("\(pagination.remainingCount(totalCount: matchingRecipes.count)) remaining")
                                            .foregroundStyle(Color.foodSecondaryInk)
                                    }
                                    .frame(minHeight: 44)
                                    .padding(.horizontal, FoodSpacing.medium)
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Shows the next page of recipes")
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
        .onChange(of: search) { _, _ in pagination.reset() }
        .onChange(of: mealType) { _, _ in pagination.reset() }
        .onChange(of: sort) { _, _ in pagination.reset() }
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
        let recipes = store.recipes.filter { recipe in
            let matchesType = mealType == "All" || recipe.mealType == mealType
            let matchesSearch = search.isEmpty || recipe.name.localizedCaseInsensitiveContains(search) || recipe.tags.contains {
                $0.localizedCaseInsensitiveContains(search)
            }
            return matchesType && matchesSearch
        }

        return recipes.sorted(by: sort.areInIncreasingOrder)
    }
}

enum RecipeSort: String, CaseIterable, Identifiable {
    case nameAscending
    case nameDescending
    case recentlyUpdated
    case mostMade

    var id: Self { self }

    var title: String {
        switch self {
        case .nameAscending: "Name, A–Z"
        case .nameDescending: "Name, Z–A"
        case .recentlyUpdated: "Recently updated"
        case .mostMade: "Most made"
        }
    }

    var systemImage: String {
        switch self {
        case .nameAscending: "textformat.abc"
        case .nameDescending: "textformat.abc.dottedunderline"
        case .recentlyUpdated: "clock.arrow.circlepath"
        case .mostMade: "fork.knife"
        }
    }

    func areInIncreasingOrder(_ left: Recipe, _ right: Recipe) -> Bool {
        switch self {
        case .nameAscending:
            return compareNames(left, right) == .orderedAscending
        case .nameDescending:
            return compareNames(left, right) == .orderedDescending
        case .recentlyUpdated:
            if left.updatedAt != right.updatedAt { return left.updatedAt > right.updatedAt }
        case .mostMade:
            if left.mealsEatenCount != right.mealsEatenCount {
                return left.mealsEatenCount > right.mealsEatenCount
            }
        }

        return compareNames(left, right) == .orderedAscending
    }

    private func compareNames(_ left: Recipe, _ right: Recipe) -> ComparisonResult {
        left.name.localizedCaseInsensitiveCompare(right.name)
    }
}

struct RecipeListPagination {
    let pageSize: Int
    private(set) var visibleCount: Int

    init(pageSize: Int = 25) {
        self.pageSize = max(1, pageSize)
        visibleCount = max(1, pageSize)
    }

    func visibleItems<Element>(from items: [Element]) -> ArraySlice<Element> {
        items.prefix(visibleCount)
    }

    func hasMore(totalCount: Int) -> Bool {
        visibleCount < totalCount
    }

    func remainingCount(totalCount: Int) -> Int {
        max(0, totalCount - visibleCount)
    }

    mutating func loadNextPage(totalCount: Int) {
        visibleCount = min(totalCount, visibleCount + pageSize)
    }

    mutating func reset() {
        visibleCount = pageSize
    }
}

struct RecipeEditor: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var recipe: Recipe?
    var sourceRecipe: Recipe?
    @State private var name: String
    @State private var emoji: String
    @State private var mealType: String
    @State private var difficulty: String
    @State private var visibility: String
    @State private var recipeType: Recipe.RecipeType
    @State private var tags: String
    @State private var recipeLink: String
    @State private var recipeBookID: String?
    @State private var page: String
    @State private var ingredients: String
    @State private var instructions: String

    init(recipe: Recipe? = nil, sourceRecipe: Recipe? = nil) {
        self.recipe = recipe
        self.sourceRecipe = sourceRecipe
        let template = recipe ?? sourceRecipe
        _name = State(initialValue: sourceRecipe.map { "\($0.name) (Remix)" } ?? recipe?.name ?? "")
        _emoji = State(initialValue: template?.emoji ?? "🍽️")
        _mealType = State(initialValue: template?.mealType ?? "Dinner")
        _difficulty = State(initialValue: template?.difficulty ?? "Easy")
        _visibility = State(initialValue: recipe?.visibility ?? "private")
        _recipeType = State(initialValue: template?.recipeType ?? .standard)
        _tags = State(initialValue: template?.tags.joined(separator: ", ") ?? "")
        _recipeLink = State(initialValue: template?.recipeLink ?? "")
        _recipeBookID = State(initialValue: template?.recipeBookID)
        _page = State(initialValue: template?.page ?? "")
        _ingredients = State(initialValue: template?.ingredients.flatMap(\.items).joined(separator: "\n") ?? "")
        _instructions = State(initialValue: template?.instructions ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    TextField("Name", text: $name)
                    TextField("Emoji", text: $emoji)
                    Picker("Recipe type", selection: $recipeType) {
                        ForEach(Recipe.RecipeType.allCases) { type in Text(type.label).tag(type) }
                    }
                    if recipeType == .coffeeDrink {
                        VStack(alignment: .leading, spacing: FoodSpacing.small) {
                            DialYourEspressoBrand(detail: "Coffee recipe destination", size: .standard)
                            Text(dialAvailabilityDescription)
                                .font(.caption)
                                .foregroundStyle(Color.foodSecondaryInk)
                        }
                        .padding(.vertical, FoodSpacing.extraSmall)
                    }
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
            .navigationTitle(sourceRecipe != nil ? "Remix recipe" : recipe == nil ? "New recipe" : "Edit recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var value = recipe ?? Recipe(sourceRecipeID: sourceRecipe?.id, name: name)
                        value.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        value.emoji = emoji.isEmpty ? "🍽️" : emoji
                        value.mealType = mealType
                        value.difficulty = difficulty
                        value.visibility = visibility
                        value.recipeType = recipeType
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

    private var dialAvailabilityDescription: String {
        switch visibility {
        case "public": "This coffee drink will be searchable by signed-in Dial users."
        case "unlisted": "This coffee drink will be available in Dial by direct link, but not browse or search."
        default: "This coffee drink is available only to the Dial team paired with this Listo team."
        }
    }
}
