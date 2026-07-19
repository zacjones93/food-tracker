import Foundation
import XCTest
@testable import FoodTracker

@MainActor
final class FoodTrackerStoreTests: XCTestCase {
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
        let mutation = try PendingMutation(entity: .recipe, value: Recipe(name: "Toast"))
        let data = try FoodTrackerCoding.encoder.encode(SyncEnvelope(mutations: [mutation]))
        let JSON = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let mutations = try XCTUnwrap(JSON["mutations"] as? [[String: Any]])

        XCTAssertEqual(mutations.first?["entityType"] as? String, "recipe")
        XCTAssertEqual(mutations.first?["operation"] as? String, "create")
        XCTAssertEqual(mutations.first?["clientEntityId"] as? String, mutation.entityID)
        XCTAssertEqual((mutations.first?["payload"] as? [String: Any])?["name"] as? String, "Toast")
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
    func loadWorkspace(cursor: String?) async throws -> FoodWorkspace { workspace }
    func sync(_ envelope: SyncEnvelope) async throws -> SyncResponse { syncResult }
    func askAssistant(chatID: String, messages: [AssistantMessage]) async throws -> String { "Try soup." }
}
