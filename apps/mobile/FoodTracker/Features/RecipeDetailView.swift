import SwiftUI

struct RecipeDetailView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let recipeID: String
    @State private var showingEdit = false
    @State private var showingSchedule = false
    @State private var confirmingDelete = false

    var body: some View {
        Group {
            if store.isInitialLoading {
                RecipeDetailLoadingState()
            } else if let recipe = store.recipe(id: recipeID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: FoodSpacing.extraLarge) {
                        VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                            Text(recipe.emoji).font(.system(size: 50))
                            Text(recipe.name)
                                .font(.system(.largeTitle, design: .serif, weight: .regular))
                                .foregroundStyle(Color.foodDeep)
                            HStack(spacing: FoodSpacing.small) {
                                FoodTag(text: recipe.mealType)
                                FoodTag(text: recipe.difficulty)
                                ForEach(recipe.tags.prefix(3), id: \.self) { FoodTag(text: $0) }
                            }
                        }

                        Button { showingSchedule = true } label: {
                            PrimaryActionLabel(title: "Add to meal plan", systemImage: "calendar.badge.plus")
                        }
                        .buttonStyle(.borderedProminent)

                        if !recipe.ingredients.isEmpty {
                            VStack(alignment: .leading, spacing: FoodSpacing.large) {
                                Text("Ingredients").font(.title2.weight(.semibold)).foregroundStyle(Color.foodDeep)
                                ForEach(recipe.ingredients) { section in
                                    VStack(alignment: .leading, spacing: FoodSpacing.small) {
                                        if !section.title.isEmpty && recipe.ingredients.count > 1 {
                                            Text(section.title).font(.headline)
                                        }
                                        ForEach(section.items, id: \.self) { item in
                                            HStack(alignment: .firstTextBaseline, spacing: FoodSpacing.small) {
                                                Circle().fill(Color.foodAccent).frame(width: 5, height: 5)
                                                Text(item).frame(maxWidth: .infinity, alignment: .leading)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if !recipe.instructions.isEmpty {
                            VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                                Text("Method").font(.title2.weight(.semibold)).foregroundStyle(Color.foodDeep)
                                Text(LocalizedStringKey(recipe.instructions))
                                    .lineSpacing(5)
                            }
                        }

                        if !recipe.recipeLink.isEmpty || recipe.recipeBookID != nil {
                            VStack(alignment: .leading, spacing: FoodSpacing.small) {
                                Text("Source").font(.headline)
                                if let URL = URL(string: recipe.recipeLink), !recipe.recipeLink.isEmpty {
                                    Link(destination: URL) { Label("Open original recipe", systemImage: "safari") }
                                }
                                if let bookID = recipe.recipeBookID,
                                   let book = store.recipeBooks.first(where: { $0.id == bookID }) {
                                    Label("\(book.name)\(recipe.page.isEmpty ? "" : ", page \(recipe.page)")", systemImage: "books.vertical")
                                }
                            }
                            .foregroundStyle(Color.foodSecondaryInk)
                        }
                    }
                    .padding(FoodSpacing.medium)
                    .frame(maxWidth: 720, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .background(Color.foodPaper)
                .navigationTitle(recipe.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu("Recipe actions", systemImage: "ellipsis.circle") {
                            Button("Edit", systemImage: "pencil") { showingEdit = true }
                            ShareLink(item: recipe.recipeLink.isEmpty ? recipe.name : recipe.recipeLink) {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                            Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                        }
                    }
                }
                .sheet(isPresented: $showingEdit) { RecipeEditor(recipe: recipe) }
                .sheet(isPresented: $showingSchedule) { WeekPickerForRecipe(recipeID: recipe.id) }
                .confirmationDialog("Delete \(recipe.name)?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                    Button("Delete recipe", role: .destructive) {
                        store.deleteRecipe(id: recipe.id)
                        dismiss()
                    }
                } message: {
                    Text("It will also be removed from meal plans when this change syncs.")
                }
            } else {
                FoodEmptyState(symbol: "book.closed", title: "Recipe unavailable", detail: "It may have been removed on another device.")
            }
        }
    }
}

private struct RecipeDetailLoadingState: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FoodSpacing.extraLarge) {
                FoodSkeleton(width: 52, height: 52, radius: FoodRadius.large)
                FoodSkeleton(width: 258, height: 34)
                HStack(spacing: FoodSpacing.small) {
                    FoodSkeleton(width: 76, height: 26, radius: 13)
                    FoodSkeleton(width: 92, height: 26, radius: 13)
                }
                FoodSkeleton(height: 44, radius: FoodRadius.medium)
                VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                    FoodSkeleton(width: 124, height: 22)
                    ForEach(0..<5, id: \.self) { index in
                        FoodSkeleton(width: index.isMultiple(of: 2) ? 248 : 286, height: 15)
                    }
                }
            }
            .padding(FoodSpacing.medium)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading recipe")
        }
        .background(Color.foodPaper)
    }
}

private struct WeekPickerForRecipe: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let recipeID: String

    var body: some View {
        NavigationStack {
            List(store.weeks.filter { $0.status != .archived }) { week in
                Button {
                    store.scheduleRecipe(recipeID: recipeID, weekID: week.id)
                    dismiss()
                } label: {
                    HStack {
                        Text(week.emoji)
                        Text(week.name)
                        Spacer()
                        if store.scheduledRecipes(for: week.id).contains(where: { $0.recipeID == recipeID }) {
                            Image(systemName: "checkmark").foregroundStyle(Color.foodSuccess)
                        }
                    }
                }
                .disabled(store.scheduledRecipes(for: week.id).contains(where: { $0.recipeID == recipeID }))
            }
            .foodListBackground()
            .navigationTitle("Add to week")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
