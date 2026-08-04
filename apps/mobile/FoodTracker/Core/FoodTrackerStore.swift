import Foundation
import Observation

protocol WorkspacePersisting: Sendable {
    func load() throws -> FoodWorkspace?
    func save(_ workspace: FoodWorkspace) throws
    func removeAll() throws
}

struct JSONWorkspaceStorage: WorkspacePersisting {
    let fileURL: URL

    static func principal(userID: String, teamID: String) -> JSONWorkspaceStorage {
        let safePrincipal = "\(userID)_\(teamID)"
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "FoodTracker/Workspaces", directoryHint: .isDirectory)
        return JSONWorkspaceStorage(fileURL: root.appending(path: "\(safePrincipal).json"))
    }

    static func removeAll(userID: String, root: URL? = nil) throws {
        let workspaceRoot = root ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0].appending(path: "FoodTracker/Workspaces", directoryHint: .isDirectory)
        guard FileManager.default.fileExists(atPath: workspaceRoot.path) else { return }

        let safeUserID = userID
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
        let prefix = "\(safeUserID)_"
        let files = try FileManager.default.contentsOfDirectory(
            at: workspaceRoot,
            includingPropertiesForKeys: nil
        )
        for file in files where file.lastPathComponent.hasPrefix(prefix) && file.pathExtension == "json" {
            try FileManager.default.removeItem(at: file)
        }
    }

    func load() throws -> FoodWorkspace? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return try FoodTrackerCoding.decoder.decode(FoodWorkspace.self, from: Data(contentsOf: fileURL))
    }

    func save(_ workspace: FoodWorkspace) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try FoodTrackerCoding.encoder.encode(workspace)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }

    func removeAll() throws {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        try FileManager.default.removeItem(at: fileURL)
    }
}

@MainActor
@Observable
final class FoodTrackerStore {
    enum Tab: Hashable {
        case schedule
        case recipes
        case assistant
        case more
    }

    struct PreparationSchedule: Hashable, Sendable {
        var recipeRelationID: String
        var recipeID: String
        var scheduledDate: Date?
    }

    struct AssistantLaunch: Identifiable, Hashable, Sendable {
        let id = UUID()
        var context: AssistantPageContext
        var suggestedPrompt: String
    }

    var selectedTab: Tab = .schedule
    private(set) var assistantLaunch: AssistantLaunch?
    private(set) var workspace: FoodWorkspace
    private(set) var activePrincipalID: String?
    private(set) var isInitialLoading: Bool
    private(set) var isRefreshing = false
    private(set) var isSyncing = false
    private(set) var syncMessage: String?
    private(set) var persistenceMessage: String?

    @ObservationIgnored private var storage: (any WorkspacePersisting)?

    init(storage: (any WorkspacePersisting)? = nil, seedIfEmpty: Bool = false) {
        self.storage = storage
        do {
            if let savedWorkspace = try storage?.load() {
                workspace = savedWorkspace
                isInitialLoading = false
            } else if seedIfEmpty {
                workspace = Self.previewWorkspace
                isInitialLoading = false
            } else {
                workspace = .empty
                isInitialLoading = true
            }
        } catch {
            workspace = .empty
            isInitialLoading = false
            persistenceMessage = "Your saved kitchen could not be opened. The original file was left untouched."
        }
    }

    var recipes: [Recipe] { workspace.recipes }
    var recipeRelations: [RecipeRelation] { workspace.recipeRelations }
    var weeks: [WeekPlan] { workspace.weeks }
    var groceryItems: [GroceryItem] { workspace.groceryItems }
    var recipeBooks: [RecipeBook] { workspace.recipeBooks }
    var groceryTemplates: [GroceryTemplate] { workspace.groceryTemplates }
    var pendingCount: Int { workspace.outbox.count }

    func openAssistant(
        context: AssistantPageContext,
        suggestedPrompt: String
    ) {
        assistantLaunch = AssistantLaunch(
            context: context,
            suggestedPrompt: suggestedPrompt
        )
        selectedTab = .assistant
    }

    func consumeAssistantLaunch(id: UUID) {
        guard assistantLaunch?.id == id else { return }
        assistantLaunch = nil
    }

    func activateWorkspace(userID: String, teamID: String) {
        let principalID = "\(userID):\(teamID)"
        guard principalID != activePrincipalID else { return }
        activePrincipalID = principalID
        storage = JSONWorkspaceStorage.principal(userID: userID, teamID: teamID)
        do {
            if let savedWorkspace = try storage?.load() {
                workspace = savedWorkspace
                isInitialLoading = false
            } else {
                workspace = .empty
                isInitialLoading = true
            }
            persistenceMessage = nil
        } catch {
            workspace = .empty
            isInitialLoading = true
            persistenceMessage = "Your saved kitchen could not be opened. The original file was left untouched."
        }
    }

    func deactivateWorkspace() {
        activePrincipalID = nil
        storage = nil
        workspace = .empty
        isInitialLoading = true
        syncMessage = nil
    }

    func purgeAccountData(userID: String) {
        do {
            try JSONWorkspaceStorage.removeAll(userID: userID)
            persistenceMessage = nil
        } catch {
            persistenceMessage = "Your account was deleted, but iOS could not remove every saved offline file. Reinstall the app to clear its local storage."
        }
        deactivateWorkspace()
    }

    func scheduledRecipes(for weekID: String) -> [ScheduledRecipe] {
        let calendar = Calendar.autoupdatingCurrent
        return workspace.scheduledRecipes
            .filter { $0.weekID == weekID }
            .sorted { lhs, rhs in
                let lhsDate = lhs.scheduledDate.map(calendar.startOfDay(for:))
                let rhsDate = rhs.scheduledDate.map(calendar.startOfDay(for:))
                if lhsDate != rhsDate {
                    return (lhsDate ?? .distantFuture) < (rhsDate ?? .distantFuture)
                }
                return lhs.order < rhs.order
            }
    }

    func recipes(for weekID: String) -> [Recipe] {
        let IDs = Set(scheduledRecipes(for: weekID).map(\.recipeID))
        return workspace.recipes.filter { IDs.contains($0.id) }
    }

    func groceryItems(for weekID: String) -> [GroceryItem] {
        workspace.groceryItems
            .filter { $0.weekID == weekID }
            .sorted { $0.order < $1.order }
    }

    func recipe(id: String) -> Recipe? { workspace.recipes.first { $0.id == id } }
    func week(id: String) -> WeekPlan? { workspace.weeks.first { $0.id == id } }
    func scheduledRecipe(id: String) -> ScheduledRecipe? {
        workspace.scheduledRecipes.first { $0.id == id }
    }
    func preparationRelations(for recipeID: String) -> [RecipeRelation] {
        workspace.recipeRelations
            .filter { $0.mainRecipeID == recipeID && $0.scheduleLeadDays != nil }
            .sorted { $0.order < $1.order }
    }

    func saveRecipe(_ recipe: Recipe) {
        var value = recipe
        value.updatedAt = .now
        replace(&workspace.recipes, with: value)
        queue(.recipe, value: value)
        persist()
    }

    func deleteRecipe(id: String) {
        let serverID = workspace.recipes.first { $0.id == id }?.serverID
        let removedRelationIDs = Set(workspace.scheduledRecipes.filter { $0.recipeID == id }.map(\.id))
        workspace.recipes.removeAll { $0.id == id }
        workspace.recipeRelations.removeAll { $0.mainRecipeID == id || $0.sideRecipeID == id }
        workspace.scheduledRecipes.removeAll { $0.recipeID == id }
        workspace.outbox.removeAll { $0.entity == .scheduledRecipe && removedRelationIDs.contains($0.entityID) }
        queueDelete(.recipe, id: id, serverID: serverID)
        persist()
    }

    func saveWeek(_ week: WeekPlan) {
        var value = week
        value.updatedAt = .now
        replace(&workspace.weeks, with: value)
        queue(.week, value: value)
        persist()
    }

    func deleteWeek(id: String) {
        let serverID = workspace.weeks.first { $0.id == id }?.serverID
        let removedRelationIDs = Set(workspace.scheduledRecipes.filter { $0.weekID == id }.map(\.id))
        let removedGroceryIDs = Set(workspace.groceryItems.filter { $0.weekID == id }.map(\.id))
        workspace.weeks.removeAll { $0.id == id }
        workspace.scheduledRecipes.removeAll { $0.weekID == id }
        workspace.groceryItems.removeAll { $0.weekID == id }
        workspace.outbox.removeAll {
            ($0.entity == .scheduledRecipe && removedRelationIDs.contains($0.entityID)) ||
                ($0.entity == .groceryItem && removedGroceryIDs.contains($0.entityID))
        }
        queueDelete(.week, id: id, serverID: serverID)
        persist()
    }

    func scheduleRecipe(
        recipeID: String,
        weekID: String,
        date: Date? = nil,
        preparations: [PreparationSchedule] = []
    ) {
        guard !workspace.scheduledRecipes.contains(where: { $0.recipeID == recipeID && $0.weekID == weekID }) else { return }
        let currentCount = scheduledRecipes(for: weekID).count
        let scheduled = ScheduledRecipe(
            weekID: weekID,
            recipeID: recipeID,
            scheduledDate: date,
            order: currentCount
        )
        workspace.scheduledRecipes.append(scheduled)
        queue(.scheduledRecipe, value: scheduled)

        let relationsByID = Dictionary(uniqueKeysWithValues: workspace.recipeRelations.map { ($0.id, $0) })
        for (index, preparation) in preparations.enumerated() {
            guard let relation = relationsByID[preparation.recipeRelationID],
                  relation.mainRecipeID == recipeID,
                  relation.sideRecipeID == preparation.recipeID,
                  relation.scheduleLeadDays != nil
            else { continue }

            let preparationRecipe = ScheduledRecipe(
                weekID: weekID,
                recipeID: preparation.recipeID,
                scheduledForWeekRecipeID: scheduled.id,
                sourceRecipeRelationID: relation.id,
                scheduledDate: preparation.scheduledDate,
                order: currentCount + index + 1
            )
            workspace.scheduledRecipes.append(preparationRecipe)
            queue(.scheduledRecipe, value: preparationRecipe)
        }
        persist()
    }

    func removeScheduledRecipe(id: String) {
        let serverID = workspace.scheduledRecipes.first { $0.id == id }?.serverID
        for index in workspace.scheduledRecipes.indices
        where workspace.scheduledRecipes[index].scheduledForWeekRecipeID == id {
            workspace.scheduledRecipes[index].scheduledForWeekRecipeID = nil
            workspace.scheduledRecipes[index].sourceRecipeRelationID = nil
            workspace.scheduledRecipes[index].updatedAt = .now
            queue(.scheduledRecipe, value: workspace.scheduledRecipes[index])
        }
        workspace.scheduledRecipes.removeAll { $0.id == id }
        queueDelete(.scheduledRecipe, id: id, serverID: serverID)
        persist()
    }

    func moveScheduledRecipe(id: String, to date: Date?, before destinationID: String? = nil) {
        guard let movingIndex = workspace.scheduledRecipes.firstIndex(where: { $0.id == id }) else { return }
        let calendar = Calendar.autoupdatingCurrent
        let sourceDate = workspace.scheduledRecipes[movingIndex].scheduledDate
        let targetDate = date.map(calendar.startOfDay(for:))
        let weekID = workspace.scheduledRecipes[movingIndex].weekID

        workspace.scheduledRecipes[movingIndex].scheduledDate = targetDate
        workspace.scheduledRecipes[movingIndex].updatedAt = .now

        if !datesMatch(sourceDate, targetDate, calendar: calendar) {
            normalizeScheduledRecipeOrder(weekID: weekID, date: sourceDate, calendar: calendar)
        }

        var targetIDs = scheduledRecipes(for: weekID)
            .filter { datesMatch($0.scheduledDate, targetDate, calendar: calendar) && $0.id != id }
            .map(\.id)
        if let destinationID, let destinationIndex = targetIDs.firstIndex(of: destinationID) {
            targetIDs.insert(id, at: destinationIndex)
        } else {
            targetIDs.append(id)
        }
        updateScheduledRecipeOrder(targetIDs)
        persist()
    }

    func setScheduledRecipeMade(id: String, isMade: Bool) {
        guard let index = workspace.scheduledRecipes.firstIndex(where: { $0.id == id }) else { return }
        let wasMade = workspace.scheduledRecipes[index].made
        workspace.scheduledRecipes[index].made = isMade
        workspace.scheduledRecipes[index].updatedAt = .now
        queue(.scheduledRecipe, value: workspace.scheduledRecipes[index])

        if wasMade != isMade,
           let recipeIndex = workspace.recipes.firstIndex(where: { $0.id == workspace.scheduledRecipes[index].recipeID }) {
            workspace.recipes[recipeIndex].mealsEatenCount = max(
                0,
                workspace.recipes[recipeIndex].mealsEatenCount + (isMade ? 1 : -1)
            )
            workspace.recipes[recipeIndex].lastMadeDate = isMade ? .now : workspace.recipes[recipeIndex].lastMadeDate
            workspace.recipes[recipeIndex].updatedAt = .now
            queue(.recipe, value: workspace.recipes[recipeIndex])
        }
        persist()
    }

    func saveGroceryItem(_ item: GroceryItem) {
        var value = item
        value.updatedAt = .now
        replace(&workspace.groceryItems, with: value)
        queue(.groceryItem, value: value)
        persist()
    }

    func toggleGroceryItem(id: String) {
        guard let index = workspace.groceryItems.firstIndex(where: { $0.id == id }) else { return }
        workspace.groceryItems[index].isChecked.toggle()
        workspace.groceryItems[index].updatedAt = .now
        queue(.groceryItem, value: workspace.groceryItems[index])
        persist()
    }

    func deleteGroceryItem(id: String) {
        let serverID = workspace.groceryItems.first { $0.id == id }?.serverID
        workspace.groceryItems.removeAll { $0.id == id }
        queueDelete(.groceryItem, id: id, serverID: serverID)
        persist()
    }

    func updateGroceryItem(id: String, name: String) {
        guard let index = workspace.groceryItems.firstIndex(where: { $0.id == id }) else { return }
        workspace.groceryItems[index].name = name
        workspace.groceryItems[index].updatedAt = .now
        queue(.groceryItem, value: workspace.groceryItems[index])
        persist()
    }

    func moveGroceryItem(id: String, to category: String, before destinationID: String? = nil) {
        guard let movingIndex = workspace.groceryItems.firstIndex(where: { $0.id == id }) else { return }
        let sourceCategory = workspace.groceryItems[movingIndex].category
        let targetCategory = category.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !targetCategory.isEmpty else { return }
        let weekID = workspace.groceryItems[movingIndex].weekID

        workspace.groceryItems[movingIndex].category = targetCategory
        workspace.groceryItems[movingIndex].updatedAt = .now

        if sourceCategory != targetCategory {
            normalizeGroceryItemOrder(weekID: weekID, category: sourceCategory)
        }

        var targetIDs = groceryItems(for: weekID)
            .filter { $0.category == targetCategory && $0.id != id }
            .map(\.id)
        if let destinationID, let destinationIndex = targetIDs.firstIndex(of: destinationID) {
            targetIDs.insert(id, at: destinationIndex)
        } else {
            targetIDs.append(id)
        }
        updateGroceryItemOrder(targetIDs)
        persist()
    }

    func applyTemplate(_ template: GroceryTemplate, to weekID: String) {
        var existingNames = Set(groceryItems(for: weekID).map { $0.name.lowercased() })
        var nextOrder = groceryItems(for: weekID).count
        for category in template.categories.sorted(by: { $0.order < $1.order }) {
            for templateItem in category.items.sorted(by: { $0.order < $1.order })
            where !existingNames.contains(templateItem.name.lowercased()) {
                saveGroceryItem(GroceryItem(
                    weekID: weekID,
                    name: templateItem.name,
                    order: nextOrder,
                    category: category.category
                ))
                existingNames.insert(templateItem.name.lowercased())
                nextOrder += 1
            }
        }
    }

    func saveRecipeBook(_ book: RecipeBook) {
        var value = book
        value.updatedAt = .now
        replace(&workspace.recipeBooks, with: value)
        queue(.recipeBook, value: value)
        persist()
    }

    func saveGroceryTemplate(_ template: GroceryTemplate) {
        var value = template
        value.updatedAt = .now
        replace(&workspace.groceryTemplates, with: value)
        queue(.groceryTemplate, value: value)
        persist()
    }

    func refresh(using client: any FoodTrackerAPI) async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer {
            isRefreshing = false
            isInitialLoading = false
        }
        do {
            merge(try await client.loadWorkspace(cursor: workspace.cursor))
            syncMessage = nil
            persist()
        } catch {
            syncMessage = "You are working from the copy saved on this iPhone. Server changes will load when the connection returns."
        }
    }

    func sync(using client: any FoodTrackerAPI) async {
        guard !isSyncing, !workspace.outbox.isEmpty else { return }
        isSyncing = true
        defer { isSyncing = false }
        do {
            let response = try await client.sync(SyncEnvelope(cursor: workspace.cursor, mutations: workspace.outbox))
            for acknowledgement in response.acknowledged {
                apply(acknowledgement)
            }
            let acknowledgedIDs = Set(response.acknowledged.map(\.mutationID))
            workspace.outbox.removeAll { acknowledgedIDs.contains($0.id) }
            workspace.cursor = response.cursor ?? workspace.cursor
            if let remote = response.workspace { merge(remote) }
            syncMessage = response.conflicts.isEmpty
                ? nil
                : "\(response.conflicts.count) change\(response.conflicts.count == 1 ? " needs" : "s need") review because the same item changed elsewhere. Your local copy is still safe."
            persist()
        } catch {
            syncMessage = "\(pendingCount) change\(pendingCount == 1 ? " is" : "s are") saved on this iPhone and waiting to sync."
        }
    }

    func clearMessages() {
        syncMessage = nil
        persistenceMessage = nil
    }

    func completeInitialLoading() {
        isInitialLoading = false
    }

    private func queue<Entity: SyncEntity>(_ kind: SyncEntityKind, value: Entity) {
        do {
            var mutation = try PendingMutation(entity: kind, value: value)
            mutation.baseVersion = version(for: kind, value: value)
            if let existing = workspace.outbox.first(where: { $0.entity == kind && $0.entityID == value.id }) {
                mutation.id = existing.id
            }
            workspace.outbox.removeAll { $0.entity == kind && $0.entityID == value.id }
            workspace.outbox.append(mutation)
        } catch {
            persistenceMessage = "That change is visible now, but could not be added to the sync queue."
        }
    }

    private func queueDelete(_ kind: SyncEntityKind, id: String, serverID: String?) {
        let existing = workspace.outbox.first { $0.entity == kind && $0.entityID == id }
        workspace.outbox.removeAll { $0.entity == kind && $0.entityID == id }
        if serverID == nil, existing?.operation == .create { return }
        var mutation = PendingMutation(entity: kind, entityID: id, serverEntityID: serverID)
        mutation.baseVersion = workspace.versions?.first {
            $0.entityType == kind && ($0.clientID == id || $0.entityID == serverID)
        }?.version ?? 0
        if let existing { mutation.id = existing.id }
        workspace.outbox.append(mutation)
    }

    private func replace<Entity: SyncEntity>(_ values: inout [Entity], with value: Entity) {
        if let index = values.firstIndex(where: { $0.id == value.id }) { values[index] = value }
        else { values.append(value) }
    }

    private func datesMatch(_ lhs: Date?, _ rhs: Date?, calendar: Calendar) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none): return true
        case (.some(let lhs), .some(let rhs)): return calendar.isDate(lhs, inSameDayAs: rhs)
        default: return false
        }
    }

    private func normalizeScheduledRecipeOrder(weekID: String, date: Date?, calendar: Calendar) {
        let IDs = scheduledRecipes(for: weekID)
            .filter { datesMatch($0.scheduledDate, date, calendar: calendar) }
            .map(\.id)
        updateScheduledRecipeOrder(IDs)
    }

    private func updateScheduledRecipeOrder(_ IDs: [String]) {
        for (order, id) in IDs.enumerated() {
            guard let index = workspace.scheduledRecipes.firstIndex(where: { $0.id == id }) else { continue }
            workspace.scheduledRecipes[index].order = order
            workspace.scheduledRecipes[index].updatedAt = .now
            queue(.scheduledRecipe, value: workspace.scheduledRecipes[index])
        }
    }

    private func normalizeGroceryItemOrder(weekID: String, category: String) {
        let IDs = groceryItems(for: weekID)
            .filter { $0.category == category }
            .map(\.id)
        updateGroceryItemOrder(IDs)
    }

    private func updateGroceryItemOrder(_ IDs: [String]) {
        for (order, id) in IDs.enumerated() {
            guard let index = workspace.groceryItems.firstIndex(where: { $0.id == id }) else { continue }
            workspace.groceryItems[index].order = order
            workspace.groceryItems[index].updatedAt = .now
            queue(.groceryItem, value: workspace.groceryItems[index])
        }
    }

    private func persist() {
        do {
            try storage?.save(workspace)
            persistenceMessage = nil
        } catch {
            persistenceMessage = "Your latest change could not be saved to this iPhone."
        }
    }

    private func apply(_ acknowledgement: SyncResponse.Acknowledgement) {
        guard let kind = workspace.outbox.first(where: { $0.id == acknowledgement.mutationID })?.entity else { return }
        switch kind {
        case .recipe: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.recipes)
        case .week: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.weeks)
        case .scheduledRecipe: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.scheduledRecipes)
        case .recipeRelation: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.recipeRelations)
        case .groceryItem: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.groceryItems)
        case .recipeBook: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.recipeBooks)
        case .groceryTemplate: setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.groceryTemplates)
        }
    }

    private func setServerID<Entity: SyncEntity>(_ serverID: String?, id: String, in values: inout [Entity]) {
        guard let serverID, let index = values.firstIndex(where: { $0.id == id }) else { return }
        values[index].serverID = serverID
    }

    private func merge(_ remote: FoodWorkspace) {
        let pending = Dictionary(grouping: workspace.outbox, by: { $0.entity }).mapValues { Set($0.map(\.entityID)) }
        workspace.recipes = merged(remote.recipes, local: workspace.recipes, pending: pending[.recipe] ?? [])
        workspace.weeks = merged(remote.weeks, local: workspace.weeks, pending: pending[.week] ?? [])
        workspace.scheduledRecipes = merged(remote.scheduledRecipes, local: workspace.scheduledRecipes, pending: pending[.scheduledRecipe] ?? [])
        workspace.recipeRelations = merged(remote.recipeRelations, local: workspace.recipeRelations, pending: pending[.recipeRelation] ?? [])
        workspace.groceryItems = merged(remote.groceryItems, local: workspace.groceryItems, pending: pending[.groceryItem] ?? [])
        workspace.recipeBooks = merged(remote.recipeBooks, local: workspace.recipeBooks, pending: pending[.recipeBook] ?? [])
        workspace.groceryTemplates = merged(remote.groceryTemplates, local: workspace.groceryTemplates, pending: pending[.groceryTemplate] ?? [])
        workspace.versions = remote.versions ?? workspace.versions
        workspace.cursor = remote.cursor ?? workspace.cursor
    }

    private func version<Entity: SyncEntity>(for kind: SyncEntityKind, value: Entity) -> Int {
        workspace.versions?.first {
            $0.entityType == kind && ($0.clientID == value.id || $0.entityID == value.serverID)
        }?.version ?? 0
    }

    private func merged<Entity: SyncEntity>(_ remote: [Entity], local: [Entity], pending: Set<String>) -> [Entity] {
        var result = remote
        for localValue in local {
            let remoteIndex = result.firstIndex {
                $0.id == localValue.id ||
                    (localValue.serverID != nil && ($0.serverID == localValue.serverID || $0.id == localValue.serverID))
            }
            if pending.contains(localValue.id) {
                if let remoteIndex {
                    var pendingValue = localValue
                    pendingValue.serverID = pendingValue.serverID ?? result[remoteIndex].serverID ?? result[remoteIndex].id
                    result[remoteIndex] = pendingValue
                } else {
                    result.append(localValue)
                }
            }
        }
        return result
    }
}

extension FoodTrackerStore {
    static var preview: FoodTrackerStore { FoodTrackerStore(seedIfEmpty: true) }

    static let previewWorkspace: FoodWorkspace = {
        let pasta = Recipe(
            id: "preview_pasta",
            serverID: "rcp_pasta",
            name: "Brown Butter Tomato Pasta",
            emoji: "🍝",
            tags: ["weeknight", "vegetarian"],
            mealType: "Dinner",
            ingredients: [
                IngredientSection(title: "Pasta", items: ["12 oz rigatoni", "4 tbsp butter", "2 cups cherry tomatoes"]),
                IngredientSection(title: "Finish", items: ["Parmesan", "Basil", "Black pepper"])
            ],
            instructions: "Brown the butter. Burst the tomatoes. Toss with pasta water and finish with parmesan."
        )
        let bowls = Recipe(
            id: "preview_bowls",
            serverID: "rcp_bowls",
            name: "Crispy Tofu Rice Bowls",
            emoji: "🥢",
            tags: ["fresh", "meal prep"],
            mealType: "Dinner",
            difficulty: "Medium",
            ingredients: [IngredientSection(title: "Bowls", items: ["Tofu", "Jasmine rice", "Cucumber", "Avocado"])]
        )
        let week = WeekPlan(
            id: "preview_week",
            serverID: "wk_preview",
            name: "This week",
            emoji: "🌿",
            status: .current,
            startDate: .now,
            endDate: Calendar.current.date(byAdding: .day, value: 6, to: .now)
        )
        return FoodWorkspace(
            cursor: "preview",
            recipes: [pasta, bowls],
            weeks: [week],
            scheduledRecipes: [
                ScheduledRecipe(id: "preview_wr_1", serverID: "wr_1", weekID: week.id, recipeID: pasta.id, scheduledDate: .now),
                ScheduledRecipe(id: "preview_wr_2", serverID: "wr_2", weekID: week.id, recipeID: bowls.id, scheduledDate: Calendar.current.date(byAdding: .day, value: 2, to: .now))
            ],
            groceryItems: [
                GroceryItem(id: "preview_gi_1", serverID: "gi_1", weekID: week.id, name: "Cherry tomatoes", order: 0, category: "Produce"),
                GroceryItem(id: "preview_gi_2", serverID: "gi_2", weekID: week.id, name: "Rigatoni", order: 1, category: "Pantry"),
                GroceryItem(id: "preview_gi_3", serverID: "gi_3", weekID: week.id, name: "Parmesan", order: 2, category: "Dairy")
            ],
            recipeBooks: [RecipeBook(id: "preview_book", serverID: "rb_1", name: "Family favorites")],
            groceryTemplates: [],
            outbox: []
        )
    }()
}
