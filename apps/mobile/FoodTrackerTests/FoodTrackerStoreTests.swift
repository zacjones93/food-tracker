import Foundation
import SwiftUI
import XCTest
@testable import FoodTracker

@MainActor
final class FoodTrackerStoreTests: XCTestCase {
    func testLegacyWorkspaceDecodesWithoutDialFields() throws {
        let workspace = FoodWorkspace(
            recipes: [Recipe(name: "Soup")],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let encoded = try FoodTrackerCoding.encoder.encode(workspace)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object.removeValue(forKey: "dialTeamPaired")
        var recipes = try XCTUnwrap(object["recipes"] as? [[String: Any]])
        recipes[0].removeValue(forKey: "recipeType")
        recipes[0].removeValue(forKey: "dialExternalID")
        object["recipes"] = recipes

        let legacyData = try JSONSerialization.data(withJSONObject: object)
        let decoded = try FoodTrackerCoding.decoder.decode(FoodWorkspace.self, from: legacyData)

        XCTAssertFalse(decoded.dialTeamPaired)
        XCTAssertNil(decoded.recipes.first?.recipeType)
        XCTAssertNil(decoded.recipes.first?.dialExternalID)
    }

    func testCoffeeDrinkDialFieldsRoundTrip() throws {
        let workspace = FoodWorkspace(
            dialTeamPaired: true,
            recipes: [Recipe(dialExternalID: "lst_recipe_test", name: "Cortado", recipeType: .coffeeDrink)],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )

        let decoded = try FoodTrackerCoding.decoder.decode(
            FoodWorkspace.self,
            from: FoodTrackerCoding.encoder.encode(workspace)
        )

        XCTAssertTrue(decoded.dialTeamPaired)
        XCTAssertEqual(decoded.recipes.first?.recipeType, .coffeeDrink)
        XCTAssertEqual(decoded.recipes.first?.dialExternalID, "lst_recipe_test")
    }

    func testOpeningAssistantSelectsTabAndCarriesPageContext() {
        let store = FoodTrackerStore()
        let context = AssistantPageContext(
            kind: .recipe,
            entityId: "recipe-1",
            label: "Tomato soup",
            href: "/recipes/recipe-1"
        )

        store.openAssistant(
            context: context,
            suggestedPrompt: "What pairs well with this?"
        )

        XCTAssertEqual(store.selectedTab, .assistant)
        XCTAssertEqual(store.assistantLaunch?.context, context)
        XCTAssertEqual(store.assistantLaunch?.suggestedPrompt, "What pairs well with this?")
        let launchID = try? XCTUnwrap(store.assistantLaunch?.id)
        if let launchID { store.consumeAssistantLaunch(id: launchID) }
        XCTAssertNil(store.assistantLaunch)
    }

    func testProductionStoreStartsEmpty() {
        let store = FoodTrackerStore()

        XCTAssertTrue(store.recipes.isEmpty)
        XCTAssertTrue(store.weeks.isEmpty)
        XCTAssertEqual(store.pendingCount, 0)
        XCTAssertTrue(store.isInitialLoading)
    }

    func testSavedWorkspaceSkipsInitialLoadingState() {
        let storage = TestStorage()
        storage.workspace = .empty

        let store = FoodTrackerStore(storage: storage)

        XCTAssertFalse(store.isInitialLoading)
    }

    func testInitialLoadingEndsAfterRefresh() async {
        let store = FoodTrackerStore()

        await store.refresh(using: StubAPI())

        XCTAssertFalse(store.isInitialLoading)
    }

    func testRecipeListPaginationLoadsOnePageAtATimeAndResets() {
        var pagination = RecipeListPagination(pageSize: 2)
        let recipes = ["Soup", "Pasta", "Tacos", "Curry", "Salad"]

        XCTAssertEqual(Array(pagination.visibleItems(from: recipes)), ["Soup", "Pasta"])
        XCTAssertTrue(pagination.hasMore(totalCount: recipes.count))
        XCTAssertEqual(pagination.remainingCount(totalCount: recipes.count), 3)

        pagination.loadNextPage(totalCount: recipes.count)
        XCTAssertEqual(Array(pagination.visibleItems(from: recipes)), ["Soup", "Pasta", "Tacos", "Curry"])
        XCTAssertEqual(pagination.remainingCount(totalCount: recipes.count), 1)

        pagination.loadNextPage(totalCount: recipes.count)
        XCTAssertEqual(Array(pagination.visibleItems(from: recipes)), recipes)
        XCTAssertFalse(pagination.hasMore(totalCount: recipes.count))

        pagination.reset()
        XCTAssertEqual(Array(pagination.visibleItems(from: recipes)), ["Soup", "Pasta"])
    }

    func testRecipeHeavyWeekDetailRendersFirstFrameQuickly() throws {
        let storage = TestStorage()
        let calendar = Calendar(identifier: .gregorian)
        let startDate = try XCTUnwrap(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 2))
        )
        let endDate = try XCTUnwrap(calendar.date(byAdding: .day, value: 6, to: startDate))
        let week = WeekPlan(
            id: "performance-week",
            name: "Recipe-heavy week",
            startDate: startDate,
            endDate: endDate
        )
        let recipes = (0..<600).map {
            Recipe(id: "performance-recipe-\($0)", name: "Performance recipe \($0)")
        }
        let scheduledRecipes = (0..<240).map { index in
            ScheduledRecipe(
                id: "performance-scheduled-recipe-\(index)",
                weekID: week.id,
                recipeID: recipes[index].id,
                scheduledDate: calendar.date(
                    byAdding: .day,
                    value: index % 7,
                    to: startDate
                ),
                order: index
            )
        }
        storage.workspace = FoodWorkspace(
            recipes: recipes,
            weeks: [week],
            scheduledRecipes: scheduledRecipes,
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let store = FoodTrackerStore(storage: storage)
        let renderer = ImageRenderer(
            content: NavigationStack {
                WeekDetailView(weekID: week.id)
            }
            .environment(store)
            .frame(width: 430, height: 932)
        )

        let start = ContinuousClock.now
        let image = renderer.uiImage
        let elapsed = start.duration(to: .now)

        XCTAssertNotNil(image)
        XCTAssertLessThan(elapsed, .seconds(3))
    }

    func testRecipeEditsCoalesceIntoOneDurableMutation() throws {
        let storage = TestStorage()
        let store = FoodTrackerStore(storage: storage)
        var recipe = Recipe(name: "Soup")

        store.saveRecipe(recipe)
        recipe.name = "Tomato soup"
        store.saveRecipe(recipe)

        XCTAssertEqual(store.recipes.map(\.name), ["Tomato soup"])
        XCTAssertEqual(store.pendingCount, 1)
        let mutationID = try XCTUnwrap(storage.workspace?.outbox.first?.id)

        let relaunched = FoodTrackerStore(storage: storage)
        XCTAssertEqual(relaunched.pendingCount, 1)
        XCTAssertEqual(relaunched.workspace.outbox.first?.id, mutationID)
        XCTAssertEqual(relaunched.recipes.first?.name, "Tomato soup")
    }

    func testGroceryTogglePersistsBeforeNetworkSync() throws {
        let storage = TestStorage()
        let store = FoodTrackerStore(storage: storage)
        let item = GroceryItem(weekID: "week-local", name: "Milk")

        store.saveGroceryItem(item)
        store.toggleGroceryItem(id: item.id)

        XCTAssertTrue(try XCTUnwrap(store.groceryItems.first).isChecked)
        XCTAssertEqual(store.pendingCount, 1)
        XCTAssertTrue(try XCTUnwrap(storage.workspace?.groceryItems.first).isChecked)
    }

    func testNewWeekIsImmediatelyAvailableForOfflineInteraction() throws {
        let storage = TestStorage()
        let recipe = Recipe(id: "recipe-local", serverID: "recipe-server", name: "Soup")
        storage.workspace = FoodWorkspace(
            recipes: [recipe],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let store = FoodTrackerStore(storage: storage)
        let week = WeekPlan(name: "Offline week")

        store.saveWeek(week)
        store.scheduleRecipe(recipeID: recipe.id, weekID: week.id)
        store.saveGroceryItem(GroceryItem(weekID: week.id, name: "Milk"))

        XCTAssertEqual(store.week(id: week.id)?.name, "Offline week")
        XCTAssertEqual(store.scheduledRecipes(for: week.id).map(\.recipeID), [recipe.id])
        XCTAssertEqual(store.groceryItems(for: week.id).map(\.name), ["Milk"])
        XCTAssertEqual(store.pendingCount, 3)
        XCTAssertEqual(storage.workspace?.weeks.first?.id, week.id)
        XCTAssertEqual(storage.workspace?.scheduledRecipes.first?.weekID, week.id)
        XCTAssertEqual(storage.workspace?.groceryItems.first?.weekID, week.id)
    }

    func testMealCanMoveToAnotherScheduleDayAndReorderOffline() throws {
        let storage = TestStorage()
        let calendar = Calendar(identifier: .gregorian)
        let monday = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 7, day: 13)))
        let tuesday = try XCTUnwrap(calendar.date(byAdding: .day, value: 1, to: monday))
        storage.workspace = FoodWorkspace(
            recipes: [Recipe(id: "recipe-1", name: "Soup"), Recipe(id: "recipe-2", name: "Pasta")],
            weeks: [WeekPlan(id: "week-1", name: "Plan", startDate: monday, endDate: tuesday)],
            scheduledRecipes: [
                ScheduledRecipe(id: "meal-1", weekID: "week-1", recipeID: "recipe-1", scheduledDate: monday),
                ScheduledRecipe(id: "meal-2", weekID: "week-1", recipeID: "recipe-2", scheduledDate: tuesday)
            ],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let store = FoodTrackerStore(storage: storage)

        store.moveScheduledRecipe(id: "meal-2", to: monday, before: "meal-1")

        let meals = store.scheduledRecipes(for: "week-1")
        XCTAssertEqual(meals.map(\.id), ["meal-2", "meal-1"])
        XCTAssertTrue(try XCTUnwrap(meals.first?.scheduledDate).timeIntervalSince(monday) == 0)
        XCTAssertEqual(meals.map(\.order), [0, 1])
        XCTAssertEqual(store.pendingCount, 2)
        XCTAssertEqual(storage.workspace?.scheduledRecipes.first(where: { $0.id == "meal-2" })?.scheduledDate, monday)
    }

    func testMultipleMealsCanShareOneScheduleDayOffline() throws {
        let storage = TestStorage()
        let calendar = Calendar(identifier: .gregorian)
        let monday = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 7, day: 13)))
        storage.workspace = FoodWorkspace(
            recipes: [Recipe(id: "recipe-1", name: "Breakfast"), Recipe(id: "recipe-2", name: "Dinner")],
            weeks: [WeekPlan(id: "week-1", name: "Plan", startDate: monday, endDate: monday)],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let store = FoodTrackerStore(storage: storage)

        store.scheduleRecipe(recipeID: "recipe-1", weekID: "week-1", date: monday)
        store.scheduleRecipe(recipeID: "recipe-2", weekID: "week-1", date: monday)

        let meals = store.scheduledRecipes(for: "week-1")
        XCTAssertEqual(meals.map(\.recipeID), ["recipe-1", "recipe-2"])
        XCTAssertEqual(meals.map(\.order), [0, 1])
        XCTAssertTrue(meals.allSatisfy { $0.scheduledDate == monday })
        XCTAssertEqual(store.pendingCount, 2)
    }

    func testPreparationRecipeKeepsItsOccurrenceLinkAndSyncPayload() throws {
        let storage = TestStorage()
        let calendar = Calendar(identifier: .gregorian)
        let friday = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 7, day: 24)))
        let thursday = try XCTUnwrap(calendar.date(byAdding: .day, value: -1, to: friday))
        let pizza = Recipe(id: "recipe-pizza", name: "Pizza")
        let dough = Recipe(id: "recipe-dough", name: "Pizza dough")
        let relation = RecipeRelation(
            id: "relation-dough",
            mainRecipeID: pizza.id,
            sideRecipeID: dough.id,
            relationType: "base",
            scheduleLeadDays: 1
        )
        storage.workspace = FoodWorkspace(
            recipes: [pizza, dough],
            weeks: [WeekPlan(id: "week-1", name: "Plan")],
            scheduledRecipes: [],
            recipeRelations: [relation],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let store = FoodTrackerStore(storage: storage)

        store.scheduleRecipe(
            recipeID: pizza.id,
            weekID: "week-1",
            date: friday,
            preparations: [
                .init(
                    recipeRelationID: relation.id,
                    recipeID: dough.id,
                    scheduledDate: thursday
                )
            ]
        )

        let pizzaOccurrence = try XCTUnwrap(store.scheduledRecipes(for: "week-1").first { $0.recipeID == pizza.id })
        let doughOccurrence = try XCTUnwrap(store.scheduledRecipes(for: "week-1").first { $0.recipeID == dough.id })
        XCTAssertEqual(doughOccurrence.scheduledForWeekRecipeID, pizzaOccurrence.id)
        XCTAssertEqual(doughOccurrence.sourceRecipeRelationID, relation.id)
        XCTAssertEqual(doughOccurrence.scheduledDate, thursday)
        XCTAssertEqual(store.pendingCount, 2)

        let data = try FoodTrackerCoding.encoder.encode(SyncEnvelope(mutations: store.workspace.outbox))
        let JSON = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let mutations = try XCTUnwrap(JSON["mutations"] as? [[String: Any]])
        let prepMutation = try XCTUnwrap(mutations.first {
            ($0["clientEntityId"] as? String) == doughOccurrence.id
        })
        let payload = try XCTUnwrap(prepMutation["payload"] as? [String: Any])
        XCTAssertEqual(payload["scheduledForWeekRecipeId"] as? String, pizzaOccurrence.id)
        XCTAssertEqual(payload["sourceRecipeRelationId"] as? String, relation.id)
    }

    func testLegacyWorkspaceWithoutRecipeRelationsStillDecodes() throws {
        let encoded = try FoodTrackerCoding.encoder.encode(FoodWorkspace.empty)
        var JSON = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        JSON.removeValue(forKey: "recipeRelations")
        let legacyData = try JSONSerialization.data(withJSONObject: JSON)

        let workspace = try FoodTrackerCoding.decoder.decode(FoodWorkspace.self, from: legacyData)

        XCTAssertTrue(workspace.recipeRelations.isEmpty)
    }

    func testGroceryItemCanMoveCategoriesAndReorderOffline() {
        let storage = TestStorage()
        storage.workspace = FoodWorkspace(
            recipes: [],
            weeks: [WeekPlan(id: "week-1", name: "Plan")],
            scheduledRecipes: [],
            groceryItems: [
                GroceryItem(id: "item-1", weekID: "week-1", name: "Apples", order: 0, category: "Produce"),
                GroceryItem(id: "item-2", weekID: "week-1", name: "Carrots", order: 1, category: "Produce"),
                GroceryItem(id: "item-3", weekID: "week-1", name: "Rice", order: 0, category: "Pantry")
            ],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let store = FoodTrackerStore(storage: storage)

        store.moveGroceryItem(id: "item-3", to: "Produce", before: "item-2")
        store.updateGroceryItem(id: "item-3", name: "Basmati rice")

        let produce = store.groceryItems(for: "week-1").filter { $0.category == "Produce" }
        XCTAssertEqual(produce.map(\.id), ["item-1", "item-3", "item-2"])
        XCTAssertEqual(produce.map(\.order), [0, 1, 2])
        XCTAssertEqual(produce.map(\.name), ["Apples", "Basmati rice", "Carrots"])
        XCTAssertEqual(store.pendingCount, 3)
        XCTAssertEqual(storage.workspace?.groceryItems.first(where: { $0.id == "item-3" })?.category, "Produce")
    }

    func testAcknowledgedMutationGetsCanonicalServerIDAndLeavesOutbox() async throws {
        let storage = TestStorage()
        let store = FoodTrackerStore(storage: storage)
        let recipe = Recipe(name: "Beans")
        store.saveRecipe(recipe)
        let mutationID = try XCTUnwrap(store.workspace.outbox.first?.id)
        let API = StubAPI(syncResult: SyncResponse(
            acknowledged: [.init(mutationID: mutationID, entityID: recipe.id, serverID: "rcp_server")],
            cursor: "cursor-2",
            workspace: nil
        ))

        await store.sync(using: API)

        XCTAssertEqual(store.pendingCount, 0)
        XCTAssertEqual(store.recipes.first?.serverID, "rcp_server")
        XCTAssertEqual(store.workspace.cursor, "cursor-2")
    }

    func testRefreshPreservesPendingLocalEdit() async {
        let storage = TestStorage()
        let store = FoodTrackerStore(storage: storage)
        var local = Recipe(id: "local-one", serverID: "rcp_1", name: "Local edit")
        store.saveRecipe(local)
        local.instructions = "Keep this device copy"
        store.saveRecipe(local)

        let remote = Recipe(id: "rcp_1", serverID: "rcp_1", name: "Remote stale")
        let API = StubAPI(workspace: FoodWorkspace(
            cursor: "remote-cursor",
            recipes: [remote],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        ))

        await store.refresh(using: API)

        XCTAssertEqual(store.recipes.count, 1)
        XCTAssertEqual(store.recipes.first?.name, "Local edit")
        XCTAssertEqual(store.recipes.first?.instructions, "Keep this device copy")
        XCTAssertEqual(store.pendingCount, 1)
    }

    func testSyncPayloadEncodesMutationPayloadAsJSONObject() throws {
        let mutation = try PendingMutation(
            entity: .recipe,
            value: Recipe(sourceRecipeID: "rcp-original", name: "Toast remix")
        )
        let data = try FoodTrackerCoding.encoder.encode(SyncEnvelope(mutations: [mutation]))
        let JSON = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let mutations = try XCTUnwrap(JSON["mutations"] as? [[String: Any]])

        XCTAssertEqual(mutations.first?["entityType"] as? String, "recipe")
        XCTAssertEqual(mutations.first?["operation"] as? String, "create")
        XCTAssertEqual(mutations.first?["clientEntityId"] as? String, mutation.entityID)
        XCTAssertEqual((mutations.first?["payload"] as? [String: Any])?["name"] as? String, "Toast remix")
        XCTAssertEqual((mutations.first?["payload"] as? [String: Any])?["sourceRecipeId"] as? String, "rcp-original")
        XCTAssertNotNil((mutations.first?["payload"] as? [String: Any])?["recipeBody"])
    }

    func testFractionalServerTimestampDecodes() throws {
        let data = Data(#"{"entityType":"recipe","entityId":"rcp_1","clientId":"local_1","version":4,"deletedAt":null,"updatedAt":"2026-07-15T12:00:00.123Z"}"#.utf8)

        let version = try FoodTrackerCoding.decoder.decode(EntityVersion.self, from: data)
        let expected = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-07-15T12:00:00Z"))

        XCTAssertEqual(version.entityType, .recipe)
        XCTAssertEqual(version.version, 4)
        XCTAssertEqual(version.updatedAt.timeIntervalSince1970, expected.timeIntervalSince1970 + 0.123, accuracy: 0.001)
    }

    func testSyncContractSendsOriginAndCreateUpdateDeleteAndDecodesAcknowledgement() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(baseURL: URL(string: "https://food.example.test/api-root")!, session: URLSession)
        let create = try PendingMutation(entity: .recipe, value: Recipe(name: "Create"))
        let update = try PendingMutation(
            entity: .recipe,
            value: Recipe(id: "local-update", serverID: "rcp-update", name: "Update")
        )
        let delete = PendingMutation(entity: .recipe, entityID: "local-delete", serverEntityID: "rcp-delete")
        let responseJSON = #"{"acknowledged":[{"mutationId":"\#(create.id.uuidString)","clientEntityId":"\#(create.entityID)","serverEntityId":"rcp-created"}],"conflicts":[],"cursor":"7","workspace":{"cursor":"7","recipes":[],"weeks":[],"weekRecipes":[],"groceryItems":[],"recipeBooks":[],"groceryTemplates":[],"versions":[]}}"#

        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://food.example.test")
            let data = try request.bodyData()
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let mutations = try XCTUnwrap(object["mutations"] as? [[String: Any]])
            XCTAssertEqual(mutations.compactMap { $0["operation"] as? String }, ["create", "update", "delete"])
            XCTAssertEqual(mutations[1]["clientEntityId"] as? String, "local-update")
            XCTAssertEqual(mutations[1]["serverEntityId"] as? String, "rcp-update")
            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (response, Data(responseJSON.utf8))
        }

        let response = try await client.sync(SyncEnvelope(mutations: [create, update, delete]))

        XCTAssertEqual(response.acknowledged.first?.mutationID, create.id)
        XCTAssertEqual(response.acknowledged.first?.entityID, create.entityID)
        XCTAssertEqual(response.acknowledged.first?.serverID, "rcp-created")
    }

    func testAccountDeletionUsesAuthenticatedSameOriginMobileRoute() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )
        var requestCount = 0

        URLProtocolStub.handler = { request in
            requestCount += 1
            let URL = try XCTUnwrap(request.url)
            XCTAssertEqual(URL.path, "/api/mobile/account")
            if request.httpMethod == "GET" {
                return (
                    HTTPURLResponse(url: URL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                    Data(#"{"canDelete":true,"deletedTeams":[{"id":"team-personal","name":"Personal"}],"leftTeams":[],"ownershipTransferRequired":[]}"#.utf8)
                )
            }

            XCTAssertEqual(request.httpMethod, "DELETE")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://food.example.test")
            let body = try XCTUnwrap(
                JSONSerialization.jsonObject(with: request.bodyData()) as? [String: String]
            )
            XCTAssertEqual(body["password"], "current-password")
            XCTAssertEqual(body["confirmation"], "DELETE")
            return (
                HTTPURLResponse(url: URL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(#"{"deleted":true,"deletedTeamCount":1,"leftTeamCount":0}"#.utf8)
            )
        }

        let preview = try await client.loadAccountDeletionPreview()
        let result = try await client.deleteAccount(
            password: "current-password",
            confirmation: "DELETE"
        )

        XCTAssertEqual(requestCount, 2)
        XCTAssertEqual(preview.deletedTeams.map(\.name), ["Personal"])
        XCTAssertTrue(result.deleted)
    }

    func testAuthStoreClearsSessionOnlyAfterDeletionSucceeds() async throws {
        let session = accountDeletionTestSession()
        let successfulAuth = AuthStore(
            client: AccountDeletionStubAPI(session: session, shouldFailDeletion: false)
        )
        let didSignInSuccessfulAuth = await successfulAuth.signIn(
            email: session.user.email,
            password: "password"
        )
        XCTAssertTrue(didSignInSuccessfulAuth)

        let didDeleteSuccessfulAuth = await successfulAuth.deleteAccount(password: "password")
        XCTAssertTrue(didDeleteSuccessfulAuth)
        XCTAssertNil(successfulAuth.session)

        let failingAuth = AuthStore(
            client: AccountDeletionStubAPI(session: session, shouldFailDeletion: true)
        )
        let didSignInFailingAuth = await failingAuth.signIn(
            email: session.user.email,
            password: "password"
        )
        XCTAssertTrue(didSignInFailingAuth)

        let didDeleteFailingAuth = await failingAuth.deleteAccount(password: "wrong-password")
        XCTAssertFalse(didDeleteFailingAuth)
        XCTAssertEqual(failingAuth.session?.user.id, session.user.id)
        XCTAssertEqual(failingAuth.errorMessage, "The current password is incorrect")
    }

    func testAccountDeletionRemovesOnlyThatUsersWorkspaceFiles() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "account-deletion-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let deletedUsersFiles = [
            root.appending(path: "user-delete_team-a.json"),
            root.appending(path: "user-delete_team-b.json"),
        ]
        let otherUsersFile = root.appending(path: "user-other_team-a.json")
        let unrelatedFile = root.appending(path: "user-delete_notes.txt")
        for file in deletedUsersFiles + [otherUsersFile, unrelatedFile] {
            try Data("test".utf8).write(to: file)
        }

        try JSONWorkspaceStorage.removeAll(userID: "user-delete", root: root)

        XCTAssertTrue(deletedUsersFiles.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
        XCTAssertTrue(FileManager.default.fileExists(atPath: otherUsersFile.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: unrelatedFile.path))
        try JSONWorkspaceStorage.removeAll(userID: "user-delete", root: root)
    }

    func testAssistantHistoryAndConversationUseMobileRoutes() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )
        let summary = #"{"id":"ios_chat-1","title":"Quick chicken dinners","createdAt":"2026-07-20T12:00:00Z","updatedAt":"2026-07-21T12:00:00Z"}"#

        URLProtocolStub.handler = { request in
            let URL = try XCTUnwrap(request.url)
            let data: Data
            if URL.path == "/api/mobile/assistant/chats" {
                data = Data(#"{"chats":[\#(summary)]}"#.utf8)
            } else {
                XCTAssertEqual(URL.path, "/api/mobile/assistant/chats/ios_chat-1")
                data = Data(#"{"chat":\#(summary),"messages":[{"id":"message-1","role":"user","text":"What should I cook?"},{"id":"message-2","role":"assistant","text":"Try the lemon chicken."}]}"#.utf8)
            }
            return (
                HTTPURLResponse(url: URL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                data
            )
        }

        let chats = try await client.loadAssistantChats()
        let conversation = try await client.loadAssistantConversation(chatID: "ios_chat-1")

        XCTAssertEqual(chats.map(\.displayTitle), ["Quick chicken dinners"])
        XCTAssertEqual(conversation.chat.id, "ios_chat-1")
        XCTAssertEqual(conversation.messages.map(\.text), ["What should I cook?", "Try the lemon chicken."])
    }

    func testAssistantUsesMobileChatStreamAndPersistsConversation() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )

        URLProtocolStub.handler = { request in
            let URL = try XCTUnwrap(request.url)
            XCTAssertEqual(URL.path, "/api/mobile/assistant")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://food.example.test")
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: request.bodyData()) as? [String: Any]
            )
            XCTAssertEqual(object["chatId"] as? String, "ios_chat-1")
            let context = try XCTUnwrap(object["pageContext"] as? [String: Any])
            XCTAssertEqual(context["kind"] as? String, "recipe")
            XCTAssertEqual(context["entityId"] as? String, "recipe-1")
            let mentions = try XCTUnwrap(object["mentionedContexts"] as? [[String: Any]])
            XCTAssertEqual(mentions.first?["kind"] as? String, "week")
            XCTAssertEqual(mentions.first?["entityId"] as? String, "week-1")
            let message = try XCTUnwrap((object["messages"] as? [[String: Any]])?.first)
            let part = try XCTUnwrap((message["parts"] as? [[String: Any]])?.first)
            XCTAssertEqual(part["text"] as? String, "Find dinner")
            let stream = """
            data: {"type":"start","messageId":"assistant-1"}

            data: {"type":"tool-input-start","toolCallId":"tool-1","toolName":"search_recipes"}

            data: {"type":"text-delta","id":"text-1","delta":"Try "}

            data: {"type":"text-delta","id":"text-1","delta":"soup."}

            data: {"type":"finish"}

            """
            return (
                HTTPURLResponse(
                    url: URL,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "text/event-stream"]
                )!,
                Data(stream.utf8)
            )
        }

        var events: [AssistantStreamEvent] = []
        for try await event in client.streamAssistant(
            chatID: "ios_chat-1",
            messages: [AssistantMessage(role: "user", text: "Find dinner")],
            pageContext: AssistantPageContext(
                kind: .recipe,
                entityId: "recipe-1",
                label: "Tomato soup",
                href: "/recipes/recipe-1"
            ),
            mentionedContexts: [
                AssistantPageContext(
                    kind: .week,
                    entityId: "week-1",
                    label: "July 20–26",
                    href: "/schedule/week-1"
                )
            ]
        ) {
            events.append(event)
        }

        XCTAssertEqual(events, [
            .status("Thinking through your kitchen…"),
            .status("Checking your kitchen…"),
            .textDelta("Try "),
            .textDelta("soup."),
        ])
    }

    func testAssistantCanResumeAndExplicitlyCancelADurableRun() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )

        URLProtocolStub.handler = { request in
            let URL = try XCTUnwrap(request.url)
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: request.bodyData()) as? [String: Any]
            )
            XCTAssertEqual(object["chatId"] as? String, "ios_chat-1")
            if URL.path == "/api/mobile/assistant/cancel" {
                XCTAssertEqual(object["runId"] as? String, "run-1")
                return (
                    HTTPURLResponse(url: URL, statusCode: 202, httpVersion: nil, headerFields: nil)!,
                    Data(#"{"cancelled":true}"#.utf8)
                )
            }

            XCTAssertEqual(URL.path, "/api/mobile/assistant/resume")
            let stream = """
            data: {"type":"RUN_STARTED","threadId":"ios_chat-1","runId":"run-1"}

            data: {"type":"TOOL_CALL_START","toolCallId":"tool-1","toolCallName":"execute_typescript"}

            data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Dinner is ready."}

            data: {"type":"RUN_FINISHED","threadId":"ios_chat-1","runId":"run-1"}

            """
            return (
                HTTPURLResponse(
                    url: URL,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "text/event-stream"]
                )!,
                Data(stream.utf8)
            )
        }

        var events: [AssistantStreamEvent] = []
        for try await event in client.resumeAssistant(chatID: "ios_chat-1") {
            events.append(event)
        }
        try await client.cancelAssistant(chatID: "ios_chat-1", runID: "run-1")

        XCTAssertEqual(events, [
            .started(runID: "run-1"),
            .status("Searching your recipes and meal plans…"),
            .textDelta("Dinner is ready."),
        ])
    }

    func testAssistantApprovalRequiresAndForwardsExplicitMobileDecisions() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )

        URLProtocolStub.handler = { request in
            let URL = try XCTUnwrap(request.url)
            if URL.path == "/api/mobile/assistant/resume" {
                let stream = #"""
                data: {"type":"approval-required","parentRunId":"parent-run","approvals":[{"id":"approval_tool-1","toolCallId":"tool-1","toolName":"create_recipe_from_url","arguments":"{\"url\":\"https://example.com/soup\"}"},{"id":"approval_tool-2","toolCallId":"tool-2","toolName":"apply_team_changes","arguments":"{\"changes\":[]}"}]}

                data: [DONE]

                """#
                return (
                    HTTPURLResponse(
                        url: URL,
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "text/event-stream"]
                    )!,
                    Data(stream.utf8)
                )
            }

            XCTAssertEqual(URL.path, "/api/mobile/assistant/approval")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://food.example.test")
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: request.bodyData()) as? [String: Any]
            )
            XCTAssertEqual(object["chatId"] as? String, "ios_chat-1")
            XCTAssertEqual(object["parentRunId"] as? String, "parent-run")
            let decisions = try XCTUnwrap(object["decisions"] as? [[String: Any]])
            XCTAssertEqual(decisions.count, 2)
            XCTAssertEqual(decisions[0]["approvalId"] as? String, "approval_tool-1")
            XCTAssertEqual(decisions[0]["toolCallId"] as? String, "tool-1")
            XCTAssertEqual(decisions[0]["approved"] as? Bool, true)
            XCTAssertNil(decisions[0]["toolName"])
            XCTAssertNil(decisions[0]["arguments"])
            XCTAssertEqual(decisions[1]["approvalId"] as? String, "approval_tool-2")
            XCTAssertEqual(decisions[1]["toolCallId"] as? String, "tool-2")
            XCTAssertEqual(decisions[1]["approved"] as? Bool, false)
            let stream = """
            data: {"type":"start","runId":"child-run"}

            data: {"type":"text-delta","delta":"I imported only the approved recipe."}

            data: [DONE]

            """
            return (
                HTTPURLResponse(
                    url: URL,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "text/event-stream"]
                )!,
                Data(stream.utf8)
            )
        }

        var resumeEvents: [AssistantStreamEvent] = []
        for try await event in client.resumeAssistant(chatID: "ios_chat-1") {
            resumeEvents.append(event)
        }
        guard case .approvalRequired(let batch) = try XCTUnwrap(resumeEvents.first) else {
            return XCTFail("Expected an explicit approval event")
        }
        XCTAssertEqual(batch.parentRunId, "parent-run")
        XCTAssertEqual(batch.approvals.map(\.toolName), [
            "create_recipe_from_url",
            "apply_team_changes",
        ])

        var responseEvents: [AssistantStreamEvent] = []
        for try await event in client.respondToAssistantApprovals(
            chatID: "ios_chat-1",
            messages: [AssistantMessage(role: "user", text: "Import this recipe")],
            batch: batch,
            decisions: ["approval_tool-1": true, "approval_tool-2": false]
        ) {
            responseEvents.append(event)
        }
        XCTAssertEqual(responseEvents, [
            .started(runID: "child-run"),
            .textDelta("I imported only the approved recipe."),
        ])
    }

    func testAssistantMentionParsingAndInsertion() throws {
        let mention = try XCTUnwrap(AssistantMentionMatch.find(in: "Compare @tomato so"))

        XCTAssertEqual(mention.query, "tomato so")
        XCTAssertEqual(
            mention.replacing(in: "Compare @tomato so", with: "Tomato Soup"),
            "Compare @Tomato Soup "
        )
        XCTAssertNil(AssistantMentionMatch.find(in: "chef@example.com"))
    }

    func testTeamSwitchUsesMembershipEndpointAndReloadsTeamScopedSession() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )
        let sessionJSON = #"{"protocolVersion":1,"user":{"id":"usr_1","email":"chef@example.test","firstName":"Ada","lastName":"Lovelace","avatar":null},"activeTeam":{"id":"team_2","name":"Dinner Club","slug":"dinner-club","avatarUrl":null,"roleId":"member"},"teams":[{"id":"team_1","name":"Home","slug":"home","avatarUrl":null,"roleId":"owner"},{"id":"team_2","name":"Dinner Club","slug":"dinner-club","avatarUrl":null,"roleId":"member"}],"permissions":["access_recipes"]}"#

        URLProtocolStub.handler = { request in
            let URL = try XCTUnwrap(request.url)
            XCTAssertEqual(URL.path, "/api/mobile/session")
            if request.httpMethod == "PATCH" {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://food.example.test")
                let body = try request.bodyData()
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["teamId"] as? String, "team_2")
                return (
                    HTTPURLResponse(url: URL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                    Data(#"{"success":true,"activeTeamId":"team_2"}"#.utf8)
                )
            }

            XCTAssertEqual(request.httpMethod, "GET")
            return (
                HTTPURLResponse(url: URL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(sessionJSON.utf8)
            )
        }

        let session = try await client.switchTeam(to: "team_2")

        XCTAssertEqual(session.teamID, "team_2")
        XCTAssertEqual(session.activeTeam.roleID, "member")
        XCTAssertEqual(session.teams.count, 2)
        XCTAssertEqual(session.permissions, ["access_recipes"])
    }

    func testWorkspaceIgnoresMalformedLegacyRecipeBookCreatedAt() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        let URLSession = URLSession(configuration: configuration)
        let client = FoodTrackerAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: URLSession
        )
        let workspaceJSON = #"{"cursor":"0","recipes":[],"weeks":[],"weekRecipes":[],"groceryItems":[],"recipeBooks":[{"id":"rb_legacy","clientId":null,"name":"Legacy cookbook","createdAt":"+057765-05-15T14:56:20.000Z","updatedAt":"1970-01-01T00:00:00.000Z"}],"groceryTemplates":[],"versions":[]}"#

        URLProtocolStub.handler = { request in
            let URL = try XCTUnwrap(request.url)
            XCTAssertEqual(URL.path, "/api/mobile/workspace")
            return (
                HTTPURLResponse(url: URL, statusCode: 200, httpVersion: nil, headerFields: nil)!,
                Data(workspaceJSON.utf8)
            )
        }

        let workspace = try await client.loadWorkspace(cursor: nil)

        XCTAssertEqual(workspace.recipeBooks.map(\.name), ["Legacy cookbook"])
        XCTAssertEqual(workspace.recipeBooks.first?.updatedAt, Date(timeIntervalSince1970: 0))
    }

    func testNewWeekDefaultsToTheNextSundayAndSevenDaysLater() throws {
        let calendar = utcCalendar()
        let wednesday = try date(year: 2026, month: 7, day: 15, calendar: calendar)
        let nextSunday = WeekFormBehavior.nextSunday(from: wednesday, calendar: calendar)
        let endDate = WeekFormBehavior.endDate(for: nextSunday, calendar: calendar)

        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: nextSunday), DateComponents(year: 2026, month: 7, day: 19))
        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: endDate), DateComponents(year: 2026, month: 7, day: 26))
    }

    func testNewWeekUsesTheFollowingSundayWhenTodayIsSunday() throws {
        let calendar = utcCalendar()
        let sunday = try date(year: 2026, month: 7, day: 19, calendar: calendar)
        let nextSunday = WeekFormBehavior.nextSunday(from: sunday, calendar: calendar)

        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: nextSunday), DateComponents(year: 2026, month: 7, day: 26))
    }

    func testWeekNameMatchesWebFormatting() throws {
        let calendar = utcCalendar()
        let sameMonthStart = try date(year: 2025, month: 10, day: 14, calendar: calendar)
        let sameMonthEnd = try date(year: 2025, month: 10, day: 19, calendar: calendar)
        let crossMonthEnd = try date(year: 2025, month: 11, day: 5, calendar: calendar)

        XCTAssertEqual(
            WeekFormBehavior.name(startDate: sameMonthStart, endDate: sameMonthEnd, calendar: calendar),
            "Oct 14th - 19th, 2025"
        )
        XCTAssertEqual(
            WeekFormBehavior.name(startDate: sameMonthStart, endDate: crossMonthEnd, calendar: calendar),
            "Oct 14 - Nov 5, 2025"
        )
        XCTAssertEqual(WeekFormBehavior.weekNumber(for: sameMonthStart, calendar: calendar), 42)
    }

    private func utcCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(year: Int, month: Int, day: Int, calendar: Calendar) throws -> Date {
        try XCTUnwrap(calendar.date(from: DateComponents(year: year, month: month, day: day)))
    }
}

private final class URLProtocolStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let handler = try XCTUnwrap(Self.handler)
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private extension URLRequest {
    func bodyData() throws -> Data {
        if let httpBody { return httpBody }
        let stream = try XCTUnwrap(httpBodyStream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 4_096
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let count = stream.read(buffer, maxLength: bufferSize)
            if count < 0 { throw try XCTUnwrap(stream.streamError) }
            if count == 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

private final class TestStorage: WorkspacePersisting, @unchecked Sendable {
    var workspace: FoodWorkspace?

    func load() throws -> FoodWorkspace? { workspace }
    func save(_ workspace: FoodWorkspace) throws { self.workspace = workspace }
    func removeAll() throws { workspace = nil }
}

private struct StubAPI: FoodTrackerAPI {
    var workspace: FoodWorkspace = .empty
    var syncResult = SyncResponse(acknowledged: [], cursor: nil, workspace: nil)

    func restoreSession() async throws -> MobileSession { throw APIError.unauthorized }
    func signIn(email: String, password: String) async throws -> MobileSession { throw APIError.unauthorized }
    func signUp(firstName: String, lastName: String, email: String, password: String) async throws -> MobileSession {
        throw APIError.unauthorized
    }
    func switchTeam(to teamID: String) async throws -> MobileSession { throw APIError.unauthorized }
    func signOut() async throws {}
    func loadAccountDeletionPreview() async throws -> AccountDeletionPreview {
        throw APIError.unauthorized
    }
    func deleteAccount(password: String, confirmation: String) async throws -> AccountDeletionResult {
        throw APIError.unauthorized
    }
    func loadWorkspace(cursor: String?) async throws -> FoodWorkspace { workspace }
    func sync(_ envelope: SyncEnvelope) async throws -> SyncResponse { syncResult }
    func loadAssistantChats() async throws -> [AssistantChatSummary] { [] }
    func loadAssistantConversation(chatID: String) async throws -> AssistantConversation {
        throw APIError.server("No assistant conversation in this test")
    }
    func updateAssistantChatTitle(chatID: String, title: String) async throws {}
    func streamAssistant(
        chatID: String,
        messages: [AssistantMessage],
        pageContext: AssistantPageContext?,
        mentionedContexts: [AssistantPageContext]
    ) -> AsyncThrowingStream<AssistantStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.yield(.textDelta("Try soup."))
            continuation.finish()
        }
    }
}

private struct AccountDeletionStubAPI: FoodTrackerAPI {
    var session: MobileSession
    var shouldFailDeletion: Bool

    func restoreSession() async throws -> MobileSession { session }
    func signIn(email: String, password: String) async throws -> MobileSession { session }
    func signUp(firstName: String, lastName: String, email: String, password: String) async throws -> MobileSession {
        session
    }
    func switchTeam(to teamID: String) async throws -> MobileSession { session }
    func signOut() async throws {}
    func loadAccountDeletionPreview() async throws -> AccountDeletionPreview {
        AccountDeletionPreview(
            canDelete: true,
            deletedTeams: [.init(id: session.teamID, name: session.teamName)],
            leftTeams: [],
            ownershipTransferRequired: []
        )
    }
    func deleteAccount(password: String, confirmation: String) async throws -> AccountDeletionResult {
        if shouldFailDeletion { throw APIError.server("The current password is incorrect") }
        return AccountDeletionResult(deleted: true, deletedTeamCount: 1, leftTeamCount: 0)
    }
    func loadWorkspace(cursor: String?) async throws -> FoodWorkspace { .empty }
    func sync(_ envelope: SyncEnvelope) async throws -> SyncResponse {
        SyncResponse(acknowledged: [], cursor: nil, workspace: nil)
    }
    func loadAssistantChats() async throws -> [AssistantChatSummary] { [] }
    func loadAssistantConversation(chatID: String) async throws -> AssistantConversation {
        throw APIError.server("No assistant conversation in this test")
    }
    func updateAssistantChatTitle(chatID: String, title: String) async throws {}
    func streamAssistant(
        chatID: String,
        messages: [AssistantMessage],
        pageContext: AssistantPageContext?,
        mentionedContexts: [AssistantPageContext]
    ) -> AsyncThrowingStream<AssistantStreamEvent, Error> {
        AsyncThrowingStream { $0.finish() }
    }
}

private func accountDeletionTestSession() -> MobileSession {
    let team = MobileSession.Team(
        id: "team-personal",
        name: "Personal",
        slug: "personal",
        avatarURL: nil,
        roleID: "owner"
    )
    return MobileSession(
        protocolVersion: 1,
        user: .init(
            id: "user-delete",
            email: "chef@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
            avatar: nil
        ),
        activeTeam: team,
        teams: [team],
        permissions: [],
        entitlements: nil
    )
}
