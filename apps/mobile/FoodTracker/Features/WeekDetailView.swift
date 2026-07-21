import SwiftUI

struct WeekDetailView: View {
    enum Section: String, CaseIterable, Identifiable {
        case meals = "Meals"
        case groceries = "Groceries"
        var id: Self { self }
    }

    @Environment(FoodTrackerStore.self) private var store
    @State private var section: Section = .meals
    @State private var showingEdit = false
    @State private var mealPickerDay: ScheduleDay?
    @State private var showingNewItem = false
    @State private var showingNewCategory = false
    @State private var showingTransfer = false
    @State private var mealActionContext: MealActionContext?
    @State private var targetedMealDropZone: String?
    @State private var newItemCategory = "Other"
    @State private var editingGroceryItem: GroceryItem?
    @State private var groceryItemIDAwaitingCategory: String?
    @State private var emptyGroceryCategories: [String] = []
    @State private var collapsedGroceryCategories: Set<String> = []
    let weekID: String

    var body: some View {
        Group {
            if store.isInitialLoading {
                WeekDetailLoadingState()
            } else if let week = store.week(id: weekID) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: FoodSpacing.large) {
                        VStack(alignment: .leading, spacing: FoodSpacing.small) {
                            Text(week.emoji).font(.system(size: 42))
                            Text(week.name)
                                .font(.system(.largeTitle, design: .serif, weight: .regular))
                                .foregroundStyle(Color.foodDeep)
                            if let start = week.startDate, let end = week.endDate {
                                Text("\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))")
                                    .foregroundStyle(Color.foodSecondaryInk)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        Picker("Week section", selection: $section) {
                            ForEach(Section.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)

                        switch section {
                        case .meals: meals(week)
                        case .groceries: groceries(week)
                        }
                    }
                    .padding(FoodSpacing.medium)
                }
                .background(Color.foodPaper)
                .navigationTitle(week.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        if section == .groceries {
                            Button("New category", systemImage: "folder.badge.plus") {
                                groceryItemIDAwaitingCategory = nil
                                showingNewCategory = true
                            }
                        }

                        Button(section == .meals ? "Add recipe" : "Add item", systemImage: "plus") {
                            if section == .meals { mealPickerDay = ScheduleDay(date: nil) }
                            else {
                                newItemCategory = "Other"
                                showingNewItem = true
                            }
                        }
                        Menu("More", systemImage: "ellipsis.circle") {
                            Button("Edit week", systemImage: "pencil") { showingEdit = true }
                            if section == .groceries {
                                Button("Copy unchecked items", systemImage: "arrow.right.square") { showingTransfer = true }
                            }
                        }
                    }
                }
                .sheet(isPresented: $showingEdit) { WeekEditor(week: week) }
                .sheet(item: $mealPickerDay) { day in
                    RecipePicker(
                        weekID: weekID,
                        scheduledDate: day.date,
                        destinationName: day.title
                    )
                }
                .sheet(isPresented: $showingNewItem) {
                    GroceryItemEditor(
                        weekID: weekID,
                        initialCategory: newItemCategory,
                        categories: groceryCategories(for: week)
                    )
                }
                .sheet(item: $editingGroceryItem) { item in
                    GroceryItemEditor(
                        weekID: weekID,
                        item: item,
                        categories: groceryCategories(for: week)
                    )
                }
                .sheet(isPresented: $showingNewCategory) {
                    GroceryCategoryEditor(existingCategories: groceryCategories(for: week)) { category in
                        if let itemID = groceryItemIDAwaitingCategory {
                            moveGroceryItem(id: itemID, to: category)
                        } else if !emptyGroceryCategories.contains(category) {
                            emptyGroceryCategories.append(category)
                        }
                        groceryItemIDAwaitingCategory = nil
                    }
                }
                .sheet(isPresented: $showingTransfer) { GroceryTransferView(sourceWeekID: weekID) }
                .confirmationDialog(
                    mealActionContext.map { "Move \($0.recipeName)" } ?? "Move meal",
                    isPresented: Binding(
                        get: { mealActionContext != nil },
                        set: { isPresented in
                            if !isPresented { mealActionContext = nil }
                        }
                    ),
                    titleVisibility: .visible
                ) {
                    if let context = mealActionContext {
                        mealMoveActions(context)
                        Button("Cancel", role: .cancel) {}
                    }
                }
            } else {
                FoodEmptyState(symbol: "calendar.badge.exclamationmark", title: "Week unavailable", detail: "It may have been removed on another device.")
            }
        }
    }

    @ViewBuilder
    private func meals(_ week: WeekPlan) -> some View {
        let scheduled = store.scheduledRecipes(for: week.id)
        let days = mealDays(for: week)
        let visibleDays = days.filter { day in
            day.date != nil || days.count == 1 || scheduled.contains(where: { $0.scheduledDate == nil })
        }
        VStack(alignment: .leading, spacing: FoodSpacing.large) {
            ForEach(visibleDays) { day in
                mealSection(
                    day,
                    items: scheduled.filter { day.contains($0.scheduledDate) },
                    days: days,
                    isOutsideScheduleRange: isOutsideScheduleRange(day.date, week: week)
                )
            }
        }
    }

    private func mealSection(
        _ day: ScheduleDay,
        items: [ScheduledRecipe],
        days: [ScheduleDay],
        isOutsideScheduleRange: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: FoodSpacing.small) {
            HStack(spacing: FoodSpacing.small) {
                Text(day.title.uppercased())
                    .font(.caption.weight(.semibold))
                    .tracking(0.7)
                    .foregroundStyle(Color.foodSecondaryInk)
                if !items.isEmpty {
                    Text(items.count, format: .number)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(Color.foodSecondaryInk)
                        .accessibilityLabel("\(items.count) meal\(items.count == 1 ? "" : "s")")
                }
                if isOutsideScheduleRange {
                    Text("OUTSIDE RANGE")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.foodSecondaryInk)
                        .padding(.horizontal, FoodSpacing.small)
                        .padding(.vertical, FoodSpacing.extraSmall)
                        .background(Color.foodSecondaryInk.opacity(0.1), in: Capsule())
                }
                Spacer()
                Button("Add meal to \(day.title)", systemImage: "plus") {
                    mealPickerDay = day
                }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
            }

            if items.isEmpty {
                let dropZone = mealDropZoneKey(day: day, before: nil)
                MealEmptyDayDropZone(
                    dayTitle: day.title,
                    isTargeted: targetedMealDropZone == dropZone
                )
                .dropDestination(for: String.self) { IDs, _ in
                    guard let id = IDs.first else { return false }
                    targetedMealDropZone = nil
                    store.moveScheduledRecipe(id: id, to: day.date)
                    return true
                } isTargeted: { isTargeted in
                    setMealDropTarget(dropZone, isTargeted: isTargeted)
                }
            } else {
                VStack(spacing: 0) {
                    mealInsertionDropZone(
                        day: day,
                        before: items.first?.id,
                        showsDivider: false
                    )

                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        if let recipe = store.recipe(id: item.recipeID) {
                            mealRow(item, recipe: recipe, day: day, dayItems: items, days: days)
                        }

                        let nextID = items.indices.contains(index + 1) ? items[index + 1].id : nil
                        mealInsertionDropZone(
                            day: day,
                            before: nextID,
                            showsDivider: nextID != nil
                        )
                    }
                }
                .foodSurface()
            }
        }
    }

    private func mealRow(
        _ item: ScheduledRecipe,
        recipe: Recipe,
        day: ScheduleDay,
        dayItems: [ScheduledRecipe],
        days: [ScheduleDay]
    ) -> some View {
        let actionContext = MealActionContext(
            item: item,
            recipeName: recipe.name,
            day: day,
            dayItems: dayItems,
            days: days
        )

        return HStack(spacing: FoodSpacing.small) {
            Button {
                store.setScheduledRecipeMade(id: item.id, isMade: !item.made)
            } label: {
                Image(systemName: item.made ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.made ? Color.foodSuccess : Color.foodSecondaryInk)
            }
            .frame(width: 44, height: 44)
            .accessibilityLabel(item.made ? "Mark not made" : "Mark made")
            .sensoryFeedback(.selection, trigger: item.made)

            NavigationLink {
                RecipeDetailView(recipeID: recipe.id)
            } label: {
                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                    RecipeRow(recipe: recipe)
                    if let parentID = item.scheduledForWeekRecipeID,
                       let parent = store.scheduledRecipe(id: parentID),
                       let parentRecipe = store.recipe(id: parent.recipeID) {
                        Label("Prep for \(parentRecipe.name)", systemImage: "clock.badge.checkmark")
                            .font(.caption)
                            .foregroundStyle(Color.foodSecondaryInk)
                    }
                }
            }
            .buttonStyle(.plain)

            Button {
                mealActionContext = actionContext
            } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.foodSecondaryInk)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Move \(recipe.name)")
            .accessibilityHint("Tap for move options, or touch and hold to drag.")
            .contextMenu {
                mealMoveActions(actionContext)
            } preview: {
                MealDragPreview(recipe: recipe, day: day)
            }
            .draggable(item.id) {
                MealDragPreview(recipe: recipe, day: day)
            }
        }
        .padding(.horizontal, FoodSpacing.small)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func mealMoveActions(_ context: MealActionContext) -> some View {
        Button("Move earlier", systemImage: "arrow.up") {
            moveMeal(context.item, in: context.dayItems, day: context.day, offset: -1)
        }
        .disabled(context.dayItems.first?.id == context.item.id)

        Button("Move later", systemImage: "arrow.down") {
            moveMeal(context.item, in: context.dayItems, day: context.day, offset: 1)
        }
        .disabled(context.dayItems.last?.id == context.item.id)

        ForEach(context.days) { destination in
            Button {
                store.moveScheduledRecipe(id: context.item.id, to: destination.date)
            } label: {
                if destination.id == context.day.id {
                    Label(destination.title, systemImage: "checkmark")
                } else {
                    Text(destination.title)
                }
            }
        }

        Button("Remove from schedule", systemImage: "trash", role: .destructive) {
            store.removeScheduledRecipe(id: context.item.id)
        }
    }

    private func mealInsertionDropZone(
        day: ScheduleDay,
        before destinationID: String?,
        showsDivider: Bool
    ) -> some View {
        let dropZone = mealDropZoneKey(day: day, before: destinationID)
        return MealInsertionDropZone(
            isTargeted: targetedMealDropZone == dropZone,
            showsDivider: showsDivider
        )
        .dropDestination(for: String.self) { IDs, _ in
            guard let id = IDs.first, id != destinationID else { return false }
            targetedMealDropZone = nil
            store.moveScheduledRecipe(id: id, to: day.date, before: destinationID)
            return true
        } isTargeted: { isTargeted in
            setMealDropTarget(dropZone, isTargeted: isTargeted)
        }
    }

    private func mealDropZoneKey(day: ScheduleDay, before destinationID: String?) -> String {
        "\(day.id):\(destinationID ?? "end")"
    }

    private func setMealDropTarget(_ dropZone: String, isTargeted: Bool) {
        if isTargeted {
            targetedMealDropZone = dropZone
        } else if targetedMealDropZone == dropZone {
            targetedMealDropZone = nil
        }
    }

    private func moveMeal(_ item: ScheduledRecipe, in items: [ScheduledRecipe], day: ScheduleDay, offset: Int) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let destinationIndex = index + offset
        guard items.indices.contains(destinationIndex) else { return }

        if offset < 0 {
            store.moveScheduledRecipe(id: item.id, to: day.date, before: items[destinationIndex].id)
        } else {
            let followingIndex = destinationIndex + 1
            let followingID = items.indices.contains(followingIndex) ? items[followingIndex].id : nil
            store.moveScheduledRecipe(id: item.id, to: day.date, before: followingID)
        }
    }

    @ViewBuilder
    private func groceries(_ week: WeekPlan) -> some View {
        let items = store.groceryItems(for: week.id)
        let categories = groceryCategories(for: week)
        if items.isEmpty && emptyGroceryCategories.isEmpty {
            VStack(spacing: FoodSpacing.small) {
                FoodEmptyState(
                    symbol: "cart",
                    title: "Grocery list is clear",
                    detail: "Add ingredients as you plan, or create a category first.",
                    actionTitle: "Add item",
                    action: {
                        newItemCategory = "Other"
                        showingNewItem = true
                    }
                )
                Button("New category", systemImage: "folder.badge.plus") {
                    groceryItemIDAwaitingCategory = nil
                    showingNewCategory = true
                }
                    .buttonStyle(.bordered)
            }
            .frame(minHeight: 280)
        } else {
            VStack(alignment: .leading, spacing: FoodSpacing.large) {
                Label("Drag items between categories, or use the item menu.", systemImage: "hand.draw")
                    .font(.footnote)
                    .foregroundStyle(Color.foodSecondaryInk)

                ForEach(categories, id: \.self) { category in
                    grocerySection(category, items: groceryItems(in: category, from: items), categories: categories)
                }

                Button("New category", systemImage: "folder.badge.plus") {
                    groceryItemIDAwaitingCategory = nil
                    showingNewCategory = true
                }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !store.groceryTemplates.isEmpty {
                    Menu {
                        ForEach(store.groceryTemplates) { template in
                            Button(template.name) { store.applyTemplate(template, to: week.id) }
                        }
                    } label: {
                        Label("Apply grocery template", systemImage: "list.bullet.clipboard")
                            .frame(maxWidth: .infinity).frame(minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private func grocerySection(_ category: String, items: [GroceryItem], categories: [String]) -> some View {
        let isCollapsed = collapsedGroceryCategories.contains(category)
        return VStack(alignment: .leading, spacing: FoodSpacing.small) {
            HStack(spacing: FoodSpacing.small) {
                Button {
                    if isCollapsed { collapsedGroceryCategories.remove(category) }
                    else { collapsedGroceryCategories.insert(category) }
                } label: {
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .frame(width: 28, height: 44)
                }
                .buttonStyle(.plain)
                .disabled(items.isEmpty)
                .accessibilityLabel(isCollapsed ? "Expand \(category)" : "Collapse \(category)")

                Text(category.uppercased())
                    .font(.caption.weight(.semibold))
                    .tracking(0.7)
                    .foregroundStyle(Color.foodSecondaryInk)
                if !items.isEmpty {
                    Text(items.count, format: .number)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(Color.foodSecondaryInk)
                }
                Spacer()
                Button("Add item to \(category)", systemImage: "plus") {
                    newItemCategory = category
                    showingNewItem = true
                }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
                if items.isEmpty {
                    Button("Delete \(category)", systemImage: "trash", role: .destructive) {
                        emptyGroceryCategories.removeAll { $0 == category }
                    }
                    .labelStyle(.iconOnly)
                    .frame(width: 44, height: 44)
                }
            }

            if !isCollapsed {
                VStack(spacing: 0) {
                    if items.isEmpty {
                        Text("No items yet")
                            .font(.subheadline)
                            .foregroundStyle(Color.foodSecondaryInk)
                            .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                            .padding(.horizontal, FoodSpacing.medium)
                    } else {
                        ForEach(items) { item in
                            groceryRow(item, category: category, categories: categories)
                            if item.id != items.last?.id { Divider().padding(.leading, 48) }
                        }
                    }
                }
                .foodSurface()
                .dropDestination(for: String.self) { IDs, _ in
                    guard let id = IDs.first else { return false }
                    moveGroceryItem(id: id, to: category)
                    return true
                }
            }
        }
    }

    private func groceryRow(_ item: GroceryItem, category: String, categories: [String]) -> some View {
        HStack(spacing: FoodSpacing.small) {
            Button { store.toggleGroceryItem(id: item.id) } label: {
                Image(systemName: item.isChecked ? "checkmark.square.fill" : "square")
                    .foregroundStyle(item.isChecked ? Color.foodSuccess : Color.foodSecondaryInk)
                    .font(.title3)
            }
            .frame(width: 44, height: 44)
            .accessibilityLabel(item.isChecked ? "Mark \(item.name) unchecked" : "Mark \(item.name) checked")
            .sensoryFeedback(.selection, trigger: item.isChecked)

            Text(item.name)
                .strikethrough(item.isChecked)
                .foregroundStyle(item.isChecked ? Color.foodSecondaryInk : Color.foodDeep)
                .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "line.3.horizontal")
                .foregroundStyle(Color.foodSecondaryInk)
                .accessibilityHidden(true)

            Menu("Item actions", systemImage: "ellipsis") {
                Button("Edit item", systemImage: "pencil") { editingGroceryItem = item }
                Menu("Move to category", systemImage: "folder") {
                    ForEach(categories, id: \.self) { destination in
                        Button {
                            moveGroceryItem(id: item.id, to: destination)
                        } label: {
                            if destination == category {
                                Label(destination, systemImage: "checkmark")
                            } else {
                                Text(destination)
                            }
                        }
                    }
                    Divider()
                    Button("New category", systemImage: "folder.badge.plus") {
                        groceryItemIDAwaitingCategory = item.id
                        showingNewCategory = true
                    }
                }
                Button("Delete", systemImage: "trash", role: .destructive) { deleteGroceryItem(item) }
            }
            .labelStyle(.iconOnly)
            .frame(width: 44, height: 44)
        }
        .padding(.horizontal, FoodSpacing.small)
        .contentShape(Rectangle())
        .draggable(item.id)
        .dropDestination(for: String.self) { IDs, _ in
            guard let id = IDs.first, id != item.id else { return false }
            moveGroceryItem(id: id, to: category, before: item.id)
            return true
        }
        .accessibilityHint("Use Item actions to edit or move this item")
    }

    private func mealDays(for week: WeekPlan) -> [ScheduleDay] {
        let calendar = Calendar.autoupdatingCurrent
        var datesByDay = [Date: Date]()
        if let startDate = week.startDate ?? week.endDate,
           let endDate = week.endDate ?? week.startDate {
            var date = calendar.startOfDay(for: min(startDate, endDate))
            let end = calendar.startOfDay(for: max(startDate, endDate))
            while date <= end, datesByDay.count < 366 {
                datesByDay[date] = date
                guard let next = calendar.date(byAdding: .day, value: 1, to: date) else { break }
                date = next
            }
        }
        for scheduled in store.scheduledRecipes(for: week.id) {
            guard let date = scheduled.scheduledDate else { continue }
            let day = calendar.startOfDay(for: date)
            datesByDay[day] = day
        }
        let days = datesByDay.values.sorted().map { ScheduleDay(date: $0) }
        return [ScheduleDay(date: nil)] + days
    }

    private func isOutsideScheduleRange(_ date: Date?, week: WeekPlan) -> Bool {
        guard let date,
              let startDate = week.startDate ?? week.endDate,
              let endDate = week.endDate ?? week.startDate
        else { return false }
        let calendar = Calendar.autoupdatingCurrent
        let day = calendar.startOfDay(for: date)
        let start = calendar.startOfDay(for: min(startDate, endDate))
        let end = calendar.startOfDay(for: max(startDate, endDate))
        return day < start || day > end
    }

    private func groceryCategories(for week: WeekPlan) -> [String] {
        let itemCategories = store.groceryItems(for: week.id)
            .map(\.category)
            .filter { !$0.isEmpty }
        return Array(Set(itemCategories + emptyGroceryCategories)).sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    private func groceryItems(in category: String, from items: [GroceryItem]) -> [GroceryItem] {
        items.filter { $0.category == category }.sorted { lhs, rhs in
            if lhs.isChecked != rhs.isChecked { return !lhs.isChecked }
            return lhs.order < rhs.order
        }
    }

    private func moveGroceryItem(id: String, to category: String, before destinationID: String? = nil) {
        guard let item = store.groceryItems.first(where: { $0.id == id }) else { return }
        let sourceItems = store.groceryItems(for: item.weekID).filter { $0.category == item.category }
        if item.category != category, sourceItems.count == 1, !emptyGroceryCategories.contains(item.category) {
            emptyGroceryCategories.append(item.category)
        }
        emptyGroceryCategories.removeAll { $0 == category }
        store.moveGroceryItem(id: id, to: category, before: destinationID)
    }

    private func deleteGroceryItem(_ item: GroceryItem) {
        let categoryItems = store.groceryItems(for: item.weekID).filter { $0.category == item.category }
        if categoryItems.count == 1, !emptyGroceryCategories.contains(item.category) {
            emptyGroceryCategories.append(item.category)
        }
        store.deleteGroceryItem(id: item.id)
    }
}

private struct ScheduleDay: Identifiable {
    let date: Date?

    var id: String { date.map { String(Calendar.autoupdatingCurrent.startOfDay(for: $0).timeIntervalSince1970) } ?? "unscheduled" }
    var title: String { date?.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()) ?? "Unscheduled" }

    func contains(_ scheduledDate: Date?) -> Bool {
        switch (date, scheduledDate) {
        case (.none, .none): return true
        case (.some(let date), .some(let scheduledDate)):
            return Calendar.autoupdatingCurrent.isDate(date, inSameDayAs: scheduledDate)
        default: return false
        }
    }
}

private struct MealActionContext {
    let item: ScheduledRecipe
    let recipeName: String
    let day: ScheduleDay
    let dayItems: [ScheduledRecipe]
    let days: [ScheduleDay]
}

private struct MealDragPreview: View {
    let recipe: Recipe
    let day: ScheduleDay

    var body: some View {
        HStack(spacing: FoodSpacing.small) {
            Text(recipe.emoji)
                .font(.title2)

            VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                Text(recipe.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.foodDeep)
                    .lineLimit(2)

                Text(day.title)
                    .font(.caption)
                    .foregroundStyle(Color.foodSecondaryInk)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, FoodSpacing.medium)
        .padding(.vertical, FoodSpacing.small)
        .frame(width: 260, alignment: .leading)
        .foodSurface()
    }
}

private struct MealInsertionDropZone: View {
    let isTargeted: Bool
    let showsDivider: Bool

    var body: some View {
        ZStack {
            if showsDivider {
                Rectangle()
                    .fill(Color.foodBorder)
                    .frame(height: 0.5)
                    .padding(.leading, 50)
            }

            Capsule()
                .fill(Color.foodAccent)
                .frame(height: 3)
                .padding(.horizontal, FoodSpacing.small)
                .opacity(isTargeted ? 1 : 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 16)
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.15), value: isTargeted)
        .accessibilityHidden(true)
    }
}

private struct MealEmptyDayDropZone: View {
    let dayTitle: String
    let isTargeted: Bool

    var body: some View {
        Label(
            isTargeted ? "Release to schedule" : "Drop a meal here",
            systemImage: isTargeted ? "arrow.down.to.line.compact" : "tray.and.arrow.down"
        )
        .font(.subheadline.weight(.medium))
        .foregroundStyle(isTargeted ? Color.foodAccent : Color.foodSecondaryInk)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(isTargeted ? Color.foodAccent.opacity(0.1) : Color.clear)
        .overlay {
            RoundedRectangle(cornerRadius: FoodRadius.medium)
                .stroke(
                    isTargeted ? Color.foodAccent : Color.foodBorder,
                    style: StrokeStyle(lineWidth: isTargeted ? 2 : 1, dash: [6, 5])
                )
        }
        .clipShape(RoundedRectangle(cornerRadius: FoodRadius.medium))
        .animation(.easeOut(duration: 0.15), value: isTargeted)
        .accessibilityLabel("Drop zone for \(dayTitle)")
    }
}

private struct WeekDetailLoadingState: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FoodSpacing.large) {
                FoodSkeleton(width: 42, height: 42, radius: FoodRadius.large)
                FoodSkeleton(width: 236, height: 32)
                FoodSkeleton(width: 172, height: 15)
                FoodSkeleton(height: 34, radius: FoodRadius.medium)
                FoodListSkeleton(accessibilityLabel: "Loading week", rowCount: 4)
                    .foodSurface()
            }
            .padding(FoodSpacing.medium)
        }
        .background(Color.foodPaper)
    }
}

private struct RecipePicker: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let weekID: String
    let scheduledDate: Date?
    let destinationName: String
    @State private var search = ""
    @State private var selectedRecipeID: String?
    @State private var preparations: [PreparationPickerItem] = []

    var body: some View {
        NavigationStack {
            Group {
                if let selectedRecipe {
                    preparationForm(for: selectedRecipe)
                } else if filteredRecipes.isEmpty {
                    FoodEmptyState(
                        symbol: search.isEmpty ? "checkmark.circle" : "magnifyingglass",
                        title: search.isEmpty ? "All recipes added" : "No recipes found",
                        detail: search.isEmpty
                            ? "This schedule already contains every available recipe."
                            : "Try another recipe name."
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filteredRecipes) { recipe in
                        Button {
                            select(recipe)
                        } label: {
                            HStack(spacing: FoodSpacing.small) {
                                RecipeRow(recipe: recipe)
                                Image(systemName: "plus.circle.fill")
                                    .font(.title3)
                                    .foregroundStyle(Color.foodAccent)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Add \(recipe.name) to \(destinationName)")
                    }
                    .foodListBackground()
                }
            }
            .searchable(text: $search, prompt: "Find recipes")
            .navigationTitle(selectedRecipe.map { "Schedule \($0.name)" } ?? "Add to \(destinationName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if selectedRecipe != nil {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Back") {
                            selectedRecipeID = nil
                            preparations = []
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.large])
    }

    private var filteredRecipes: [Recipe] {
        let existing = Set(store.scheduledRecipes(for: weekID).map(\.recipeID))
        return store.recipes.filter {
            !existing.contains($0.id) && (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search))
        }
    }

    private var selectedRecipe: Recipe? {
        selectedRecipeID.flatMap(store.recipe(id:))
    }

    private func select(_ recipe: Recipe) {
        let relations = store.preparationRelations(for: recipe.id)
        guard let scheduledDate, !relations.isEmpty else {
            store.scheduleRecipe(recipeID: recipe.id, weekID: weekID, date: scheduledDate)
            return
        }

        selectedRecipeID = recipe.id
        preparations = relations.compactMap { relation in
            guard let prepRecipe = store.recipe(id: relation.sideRecipeID),
                  let leadDays = relation.scheduleLeadDays,
                  let date = Calendar.autoupdatingCurrent.date(
                    byAdding: .day,
                    value: -leadDays,
                    to: scheduledDate
                  )
            else { return nil }
            return PreparationPickerItem(
                relationID: relation.id,
                recipeID: prepRecipe.id,
                recipeName: prepRecipe.name,
                emoji: prepRecipe.emoji,
                leadDays: leadDays,
                isIncluded: true,
                scheduledDate: date
            )
        }
        if preparations.isEmpty {
            store.scheduleRecipe(recipeID: recipe.id, weekID: weekID, date: scheduledDate)
            selectedRecipeID = nil
        }
    }

    private func addSelectedRecipe(_ recipe: Recipe) {
        store.scheduleRecipe(
            recipeID: recipe.id,
            weekID: weekID,
            date: scheduledDate,
            preparations: preparations
                .filter(\.isIncluded)
                .map {
                    FoodTrackerStore.PreparationSchedule(
                        recipeRelationID: $0.relationID,
                        recipeID: $0.recipeID,
                        scheduledDate: $0.scheduledDate
                    )
                }
        )
        selectedRecipeID = nil
        preparations = []
    }

    private func preparationForm(for recipe: Recipe) -> some View {
        Form {
            Section {
                Text("Choose which preparation recipes to add before \(recipe.name).")
                    .font(.subheadline)
                    .foregroundStyle(Color.foodSecondaryInk)
            }
            Section("Preparation") {
                ForEach($preparations) { $preparation in
                    VStack(alignment: .leading, spacing: FoodSpacing.small) {
                        Toggle(isOn: $preparation.isIncluded) {
                            VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                                Text("\(preparation.emoji) \(preparation.recipeName)")
                                    .font(.body.weight(.semibold))
                                Text("Suggested \(preparation.leadDays) day\(preparation.leadDays == 1 ? "" : "s") before")
                                    .font(.caption)
                                    .foregroundStyle(Color.foodSecondaryInk)
                            }
                        }
                        if preparation.isIncluded {
                            DatePicker(
                                "Prepare on",
                                selection: $preparation.scheduledDate,
                                displayedComponents: .date
                            )
                        }
                    }
                    .padding(.vertical, FoodSpacing.extraSmall)
                }
            }
            Section {
                Button("Add to schedule", systemImage: "calendar.badge.plus") {
                    addSelectedRecipe(recipe)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .foodListBackground()
        .foodFormBehavior()
    }
}

private struct PreparationPickerItem: Identifiable {
    let relationID: String
    let recipeID: String
    let recipeName: String
    let emoji: String
    let leadDays: Int
    var isIncluded: Bool
    var scheduledDate: Date

    var id: String { relationID }
}

private struct GroceryItemEditor: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let weekID: String
    let item: GroceryItem?
    let categories: [String]
    @State private var name: String
    @State private var category: String

    init(
        weekID: String,
        item: GroceryItem? = nil,
        initialCategory: String = "Other",
        categories: [String]
    ) {
        self.weekID = weekID
        self.item = item
        self.categories = categories
        _name = State(initialValue: item?.name ?? "")
        _category = State(initialValue: item?.category ?? initialCategory)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    TextField("Item name", text: $name)
                }
                Section("Category") {
                    TextField("Category name", text: $category)
                    if !categories.isEmpty {
                        ScrollView(.horizontal) {
                            HStack(spacing: FoodSpacing.small) {
                                ForEach(categories, id: \.self) { suggestion in
                                    Button {
                                        category = suggestion
                                    } label: {
                                        Label(
                                            suggestion,
                                            systemImage: suggestion == category ? "checkmark.circle.fill" : "circle"
                                        )
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                    }
                }
            }
            .foodListBackground()
            .foodFormBehavior()
            .navigationTitle(item == nil ? "Add grocery item" : "Edit grocery item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(item == nil ? "Add" : "Save") {
                        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        let trimmedCategory = category.trimmingCharacters(in: .whitespacesAndNewlines)
                        if let item {
                            store.updateGroceryItem(id: item.id, name: trimmedName)
                            if item.category != trimmedCategory {
                                store.moveGroceryItem(id: item.id, to: trimmedCategory)
                            }
                        } else {
                            store.saveGroceryItem(GroceryItem(
                                weekID: weekID,
                                name: trimmedName,
                                order: store.groceryItems(for: weekID).count,
                                category: trimmedCategory
                            ))
                        }
                        dismiss()
                    }
                    .disabled(
                        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                            category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct GroceryCategoryEditor: View {
    @Environment(\.dismiss) private var dismiss
    let existingCategories: [String]
    let onSave: (String) -> Void
    @State private var name = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Category name", text: $name)
                        .textInputAutocapitalization(.words)
                } footer: {
                    Text("Add items now or keep the category empty while you finish organizing.")
                }
            }
            .foodListBackground()
            .foodFormBehavior()
            .navigationTitle("New category")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onSave(trimmedName)
                        dismiss()
                    }
                    .disabled(trimmedName.isEmpty || hasDuplicate)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasDuplicate: Bool {
        existingCategories.contains { $0.localizedCaseInsensitiveCompare(trimmedName) == .orderedSame }
    }
}

private struct GroceryTransferView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let sourceWeekID: String

    var body: some View {
        NavigationStack {
            Group {
                if destinationWeeks.isEmpty {
                    FoodEmptyState(
                        symbol: "calendar.badge.exclamationmark",
                        title: "No destination weeks",
                        detail: "Create another current or upcoming week before copying grocery items."
                    )
                } else {
                    List(destinationWeeks) { week in
                        Button {
                            copyItems(to: week)
                            dismiss()
                        } label: {
                            Label(week.name, systemImage: "calendar")
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                    }
                    .foodListBackground()
                }
            }
            .background(Color.foodPaper)
            .navigationTitle("Copy items to")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private var destinationWeeks: [WeekPlan] {
        store.weeks.filter { $0.id != sourceWeekID && $0.status != .archived }
    }

    private func copyItems(to week: WeekPlan) {
        let sourceItems = store.groceryItems(for: sourceWeekID).filter { !$0.isChecked }
        for (offset, item) in sourceItems.enumerated() {
            store.saveGroceryItem(GroceryItem(
                weekID: week.id,
                name: item.name,
                order: store.groceryItems(for: week.id).count + offset,
                category: item.category
            ))
        }
    }
}
