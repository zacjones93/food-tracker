import Foundation
import Network
import Observation

protocol FoodTrackerAPI: Sendable {
    func restoreSession() async throws -> MobileSession
    func signIn(email: String, password: String) async throws -> MobileSession
    func signUp(firstName: String, lastName: String, email: String, password: String) async throws -> MobileSession
    func switchTeam(to teamID: String) async throws -> MobileSession
    func signOut() async throws
    func loadAccountDeletionPreview() async throws -> AccountDeletionPreview
    func deleteAccount(password: String, confirmation: String) async throws -> AccountDeletionResult
    func loadWorkspace(cursor: String?) async throws -> FoodWorkspace
    func sync(_ envelope: SyncEnvelope) async throws -> SyncResponse
    func loadAssistantChats() async throws -> [AssistantChatSummary]
    func loadAssistantConversation(chatID: String) async throws -> AssistantConversation
    func updateAssistantChatTitle(chatID: String, title: String) async throws
    func streamAssistant(
        chatID: String,
        messages: [AssistantMessage],
        pageContext: AssistantPageContext?,
        mentionedContexts: [AssistantPageContext]
    ) -> AsyncThrowingStream<AssistantStreamEvent, Error>
    func resumeAssistant(chatID: String) -> AsyncThrowingStream<AssistantStreamEvent, Error>
    func cancelAssistant(chatID: String, runID: String) async throws
}

extension FoodTrackerAPI {
    func resumeAssistant(chatID: String) -> AsyncThrowingStream<AssistantStreamEvent, Error> {
        AsyncThrowingStream { $0.finish() }
    }

    func cancelAssistant(chatID: String, runID: String) async throws {}
}

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "List To Ladle sent an unreadable response. Please try again."
        case .unauthorized: "Your session has expired. Sign in again to continue syncing."
        case .server(let message): message
        }
    }
}

struct AssistantChatSummary: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String?
    var createdAt: Date
    var updatedAt: Date

    var displayTitle: String {
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedTitle.isEmpty ? "New conversation" : trimmedTitle
    }
}

struct AssistantConversation: Codable, Hashable, Sendable {
    var chat: AssistantChatSummary
    var messages: [AssistantMessage]
}

struct AccountDeletionPreview: Codable, Hashable, Sendable {
    struct TeamImpact: Codable, Hashable, Identifiable, Sendable {
        var id: String
        var name: String
    }

    var canDelete: Bool
    var deletedTeams: [TeamImpact]
    var leftTeams: [TeamImpact]
    var ownershipTransferRequired: [TeamImpact]
}

struct AccountDeletionResult: Codable, Hashable, Sendable {
    var deleted: Bool
    var deletedTeamCount: Int
    var leftTeamCount: Int
}

struct AssistantPageContext: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Hashable, Sendable {
        case recipe
        case week
    }

    enum Section: String, Codable, Hashable, Sendable {
        case meals
        case groceries
    }

    struct ViewContext: Codable, Hashable, Sendable {
        var section: Section?
    }

    var kind: Kind
    var entityId: String
    var label: String
    var href: String
    var view: ViewContext? = nil

    var identity: String { "\(kind.rawValue):\(entityId)" }
}

enum AssistantStreamEvent: Hashable, Sendable {
    case started(runID: String)
    case status(String)
    case textDelta(String)
}

struct FoodTrackerAPIClient: FoodTrackerAPI {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL = FoodTrackerAPIClient.defaultBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    static var defaultBaseURL: URL {
        if let configured = Bundle.main.object(forInfoDictionaryKey: "FoodTrackerAPIBaseURL") as? String,
           let URL = URL(string: configured), !configured.isEmpty {
            return URL
        }
#if DEBUG && targetEnvironment(simulator)
        return URL(string: "http://localhost:3000")!
#else
        return URL(string: "https://listtoladle.com")!
#endif
    }

    func restoreSession() async throws -> MobileSession {
        try await send(path: "/api/mobile/session", method: "GET")
    }

    func signIn(email: String, password: String) async throws -> MobileSession {
        let _: SuccessResponse = try await send(
            path: "/api/mobile/auth/sign-in",
            method: "POST",
            body: AuthRequest(email: email, password: password, name: nil)
        )
        return try await restoreSession()
    }

    func signUp(firstName: String, lastName: String, email: String, password: String) async throws -> MobileSession {
        let _: SuccessResponse = try await send(
            path: "/api/mobile/auth/sign-up",
            method: "POST",
            body: SignUpRequest(firstName: firstName, lastName: lastName, email: email, password: password)
        )
        return try await restoreSession()
    }

    func switchTeam(to teamID: String) async throws -> MobileSession {
        let _: SuccessResponse = try await send(
            path: "/api/mobile/session",
            method: "PATCH",
            body: TeamSelectionRequest(teamId: teamID)
        )
        return try await restoreSession()
    }

    func signOut() async throws {
        let _: SuccessResponse = try await send(path: "/api/mobile/auth/sign-out", method: "POST", body: EmptyRequest())
    }

    func loadAccountDeletionPreview() async throws -> AccountDeletionPreview {
        try await send(path: "/api/mobile/account", method: "GET")
    }

    func deleteAccount(password: String, confirmation: String) async throws -> AccountDeletionResult {
        try await send(
            path: "/api/mobile/account",
            method: "DELETE",
            body: AccountDeletionRequest(password: password, confirmation: confirmation)
        )
    }

    func loadWorkspace(cursor: String?) async throws -> FoodWorkspace {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/mobile/workspace"),
            resolvingAgainstBaseURL: false
        )!
        if let cursor { components.queryItems = [URLQueryItem(name: "cursor", value: cursor)] }
        let response: ServerWorkspaceDTO = try await send(URL: components.url!, method: "GET")
        return response.workspace
    }

    func sync(_ envelope: SyncEnvelope) async throws -> SyncResponse {
        let response: ServerSyncResponse = try await send(path: "/api/mobile/sync", method: "POST", body: envelope)
        return response.response
    }

    func loadAssistantChats() async throws -> [AssistantChatSummary] {
        let response: AssistantChatsResponse = try await send(
            path: "/api/mobile/assistant/chats",
            method: "GET"
        )
        return response.chats
    }

    func loadAssistantConversation(chatID: String) async throws -> AssistantConversation {
        try await send(
            path: "/api/mobile/assistant/chats/\(chatID)",
            method: "GET"
        )
    }

    func updateAssistantChatTitle(chatID: String, title: String) async throws {
        let _: SuccessResponse = try await send(
            path: "/api/mobile/assistant/chats/\(chatID)",
            method: "PATCH",
            body: AssistantTitleRequest(title: title)
        )
    }

    func streamAssistant(
        chatID: String,
        messages: [AssistantMessage],
        pageContext: AssistantPageContext?,
        mentionedContexts: [AssistantPageContext]
    ) -> AsyncThrowingStream<AssistantStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let request = try assistantRequest(
                        chatID: chatID,
                        messages: messages,
                        pageContext: pageContext,
                        mentionedContexts: mentionedContexts
                    )
                    try await streamAssistantResponse(
                        request: request,
                        continuation: continuation
                    )
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func resumeAssistant(chatID: String) -> AsyncThrowingStream<AssistantStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let request = try assistantRequest(
                        path: "/api/mobile/assistant/resume",
                        body: AssistantResumeRequest(chatId: chatID)
                    )
                    try await streamAssistantResponse(
                        request: request,
                        continuation: continuation
                    )
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func cancelAssistant(chatID: String, runID: String) async throws {
        let _: AssistantCancelResponse = try await send(
            path: "/api/mobile/assistant/cancel",
            method: "POST",
            body: AssistantCancelRequest(chatId: chatID, runId: runID)
        )
    }

    private func assistantRequest(
        chatID: String,
        messages: [AssistantMessage],
        pageContext: AssistantPageContext?,
        mentionedContexts: [AssistantPageContext]
    ) throws -> URLRequest {
        let requestMessages = messages.map { message in
            AssistantRequest.Message(
                id: message.id,
                role: message.role,
                parts: [.init(type: "text", text: message.text)]
            )
        }
        return try assistantRequest(
            path: "/api/mobile/assistant",
            body: AssistantRequest(
                chatId: chatID,
                messages: requestMessages,
                pageContext: pageContext,
                mentionedContexts: mentionedContexts.isEmpty ? nil : mentionedContexts
            )
        )
    }

    private func assistantRequest<Request: Encodable>(path: String, body: Request) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL.origin, forHTTPHeaderField: "Origin")
        request.httpBody = try FoodTrackerCoding.encoder.encode(body)
        return request
    }

    private func streamAssistantResponse(
        request: URLRequest,
        continuation: AsyncThrowingStream<AssistantStreamEvent, Error>.Continuation
    ) async throws {
        let (bytes, response) = try await session.bytes(for: request)
        guard let HTTPResponse = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        try await streamAssistantResponse(
            bytes: bytes,
            response: HTTPResponse,
            continuation: continuation
        )
    }

    private func streamAssistantResponse(
        bytes: URLSession.AsyncBytes,
        response: HTTPURLResponse,
        continuation: AsyncThrowingStream<AssistantStreamEvent, Error>.Continuation
    ) async throws {
        if response.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(response.statusCode) else {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            let error = try? FoodTrackerCoding.decoder.decode(ServerError.self, from: data)
            throw APIError.server(error?.error ?? "The assistant could not respond.")
        }

        if let runID = response.value(forHTTPHeaderField: "x-run-id"), !runID.isEmpty {
            continuation.yield(.started(runID: runID))
        }

        for try await line in bytes.lines {
            try Task.checkCancellation()
            guard let event = try assistantEvent(from: line) else { continue }
            continuation.yield(event)
        }
    }

    private func assistantEvent(from line: String) throws -> AssistantStreamEvent? {
        guard line.hasPrefix("data:") else { return nil }
        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
        guard payload != "[DONE]", let data = payload.data(using: .utf8) else { return nil }
        let event = try FoodTrackerCoding.decoder.decode(AssistantWireEvent.self, from: data)

        switch event.type {
        case "text-delta", "TEXT_MESSAGE_CONTENT":
            guard let delta = event.delta, !delta.isEmpty else { return nil }
            return .textDelta(delta)
        case "start", "RUN_STARTED":
            guard let runID = event.runId, !runID.isEmpty else {
                return .status("Thinking through your kitchen…")
            }
            return .started(runID: runID)
        case "tool-input-start", "TOOL_CALL_START":
            return .status(
                (event.toolName ?? event.toolCallName) == "codemode_execute"
                    ? "Searching your recipes and meal plans…"
                    : "Checking your kitchen…"
            )
        case "tool-output-available", "TOOL_CALL_END", "TOOL_CALL_RESULT":
            return .status("Putting it together…")
        case "error", "RUN_ERROR":
            throw APIError.server(event.errorText ?? event.message ?? "The assistant could not finish that response.")
        default:
            return nil
        }
    }

    private func send<Response: Decodable>(path: String, method: String) async throws -> Response {
        try await send(URL: baseURL.appending(path: path), method: method)
    }

    private func send<Request: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Request
    ) async throws -> Response {
        try await send(URL: baseURL.appending(path: path), method: method, body: body)
    }

    private func send<Response: Decodable>(URL: URL, method: String) async throws -> Response {
        var request = URLRequest(url: URL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(request)
    }

    private func send<Request: Encodable, Response: Decodable>(
        URL: URL,
        method: String,
        body: Request
    ) async throws -> Response {
        var request = URLRequest(url: URL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL.origin, forHTTPHeaderField: "Origin")
        request.httpBody = try FoodTrackerCoding.encoder.encode(body)
        return try await perform(request)
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let HTTPResponse = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if HTTPResponse.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(HTTPResponse.statusCode) else {
            let error = try? FoodTrackerCoding.decoder.decode(ServerError.self, from: data)
            throw APIError.server(error?.error ?? "List To Ladle could not complete that request.")
        }
        return try FoodTrackerCoding.decoder.decode(Response.self, from: data)
    }
}

private struct AuthRequest: Codable {
    var email: String
    var password: String
    var name: String?
}

private struct SignUpRequest: Codable {
    var firstName: String
    var lastName: String
    var email: String
    var password: String
}

private struct AssistantRequest: Codable {
    struct Message: Codable {
        struct Part: Codable { var type: String; var text: String }
        var id: String
        var role: String
        var parts: [Part]
    }

    var chatId: String
    var messages: [Message]
    var pageContext: AssistantPageContext?
    var mentionedContexts: [AssistantPageContext]?
}

private struct AssistantWireEvent: Codable {
    var type: String
    var runId: String?
    var delta: String?
    var message: String?
    var toolCallName: String?
    var toolName: String?
    var errorText: String?
}

private struct AssistantResumeRequest: Codable { var chatId: String }
private struct AssistantCancelRequest: Codable { var chatId: String; var runId: String }
private struct AssistantCancelResponse: Codable { var cancelled: Bool }

private struct AssistantChatsResponse: Codable { var chats: [AssistantChatSummary] }
private struct AssistantTitleRequest: Codable { var title: String }

private struct EmptyRequest: Codable {}
private struct TeamSelectionRequest: Codable { var teamId: String }
private struct SuccessResponse: Codable { var success: Bool }
private struct ServerError: Codable { var error: String }
private struct AccountDeletionRequest: Codable { var password: String; var confirmation: String }

private extension URL {
    var origin: String {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.port = port
        return components.string ?? absoluteString
    }
}

private struct ServerWorkspaceDTO: Decodable {
    struct RecipeDTO: Decodable {
        var id: String
        var clientId: String?
        var dialExternalId: String?
        var sourceRecipeId: String?
        var name: String
        var emoji: String?
        var tags: [String]?
        var mealType: String?
        var difficulty: String?
        var visibility: String
        var recipeType: Recipe.RecipeType?
        var recipeLink: String?
        var recipeBookId: String?
        var page: String?
        var lastMadeDate: Date?
        var mealsEatenCount: Int
        var ingredients: [IngredientSection]?
        var recipeBody: String?
        var updatedAt: Date?
    }

    struct WeekDTO: Decodable {
        var id: String
        var clientId: String?
        var name: String
        var emoji: String?
        var status: WeekPlan.Status
        var startDate: Date?
        var endDate: Date?
        var weekNumber: Int?
        var updatedAt: Date?
    }

    struct WeekRecipeDTO: Decodable {
        var id: String
        var clientId: String?
        var weekId: String
        var recipeId: String
        var scheduledForWeekRecipeId: String?
        var sourceRecipeRelationId: String?
        var scheduledDate: Date?
        var order: Int?
        var made: Bool
        var updatedAt: Date?
        var createdAt: Date?
    }

    struct RecipeRelationDTO: Decodable {
        var id: String
        var clientId: String?
        var mainRecipeId: String
        var sideRecipeId: String
        var relationType: String?
        var order: Int?
        var scheduleLeadDays: Int?
        var updatedAt: Date?
        var createdAt: Date?
    }

    struct GroceryItemDTO: Decodable {
        var id: String
        var clientId: String?
        var weekId: String
        var name: String
        var checked: Bool
        var order: Int?
        var category: String?
        var updatedAt: Date?
    }

    struct RecipeBookDTO: Decodable {
        var id: String
        var clientId: String?
        var name: String
        var updatedAt: Date?
        var createdAt: Date?

        private enum CodingKeys: String, CodingKey {
            case id
            case clientId
            case name
            case updatedAt
            case createdAt
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(String.self, forKey: .id)
            clientId = try container.decodeIfPresent(String.self, forKey: .clientId)
            name = try container.decode(String.self, forKey: .name)
            updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt)
            createdAt = try? container.decodeIfPresent(Date.self, forKey: .createdAt)
        }
    }

    struct GroceryTemplateDTO: Decodable {
        var id: String
        var clientId: String?
        var name: String
        var template: [GroceryTemplateCategory]
        var isDefault: Bool
        var updatedAt: Date?
    }

    var cursor: String
    var dialTeamPaired: Bool?
    var recipes: [RecipeDTO]
    var weeks: [WeekDTO]
    var weekRecipes: [WeekRecipeDTO]
    var recipeRelations: [RecipeRelationDTO]?
    var groceryItems: [GroceryItemDTO]
    var recipeBooks: [RecipeBookDTO]
    var groceryTemplates: [GroceryTemplateDTO]
    var versions: [EntityVersion]?

    var workspace: FoodWorkspace {
        let recipeIDs = Dictionary(uniqueKeysWithValues: recipes.map { ($0.id, $0.clientId ?? $0.id) })
        let weekIDs = Dictionary(uniqueKeysWithValues: weeks.map { ($0.id, $0.clientId ?? $0.id) })
        let bookIDs = Dictionary(uniqueKeysWithValues: recipeBooks.map { ($0.id, $0.clientId ?? $0.id) })
        let weekRecipeIDs = Dictionary(uniqueKeysWithValues: weekRecipes.map { ($0.id, $0.clientId ?? $0.id) })
        let relationIDs = Dictionary(
            uniqueKeysWithValues: (recipeRelations ?? []).map { ($0.id, $0.clientId ?? $0.id) }
        )

        return FoodWorkspace(
            cursor: cursor,
            dialTeamPaired: dialTeamPaired ?? false,
            recipes: recipes.map { value in
                Recipe(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    dialExternalID: value.dialExternalId,
                    sourceRecipeID: value.sourceRecipeId.flatMap { recipeIDs[$0] } ?? value.sourceRecipeId,
                    name: value.name,
                    emoji: value.emoji ?? "🍽️",
                    tags: value.tags ?? [],
                    mealType: value.mealType ?? "",
                    difficulty: value.difficulty ?? "",
                    visibility: value.visibility,
                    recipeType: value.recipeType ?? .standard,
                    recipeLink: value.recipeLink ?? "",
                    recipeBookID: value.recipeBookId.flatMap { bookIDs[$0] },
                    page: value.page ?? "",
                    lastMadeDate: value.lastMadeDate,
                    mealsEatenCount: value.mealsEatenCount,
                    ingredients: value.ingredients ?? [],
                    instructions: value.recipeBody ?? "",
                    updatedAt: value.updatedAt ?? .distantPast
                )
            },
            weeks: weeks.map { value in
                WeekPlan(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    name: value.name,
                    emoji: value.emoji ?? "🗓️",
                    status: value.status,
                    startDate: value.startDate,
                    endDate: value.endDate,
                    weekNumber: value.weekNumber,
                    updatedAt: value.updatedAt ?? .distantPast
                )
            },
            scheduledRecipes: weekRecipes.compactMap { value in
                guard let weekID = weekIDs[value.weekId], let recipeID = recipeIDs[value.recipeId] else { return nil }
                return ScheduledRecipe(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    weekID: weekID,
                    recipeID: recipeID,
                    scheduledForWeekRecipeID: value.scheduledForWeekRecipeId.flatMap { weekRecipeIDs[$0] },
                    sourceRecipeRelationID: value.sourceRecipeRelationId.flatMap { relationIDs[$0] },
                    scheduledDate: value.scheduledDate,
                    order: value.order ?? 0,
                    made: value.made,
                    updatedAt: value.updatedAt ?? value.createdAt ?? .distantPast
                )
            },
            recipeRelations: (recipeRelations ?? []).compactMap { value in
                guard let mainRecipeID = recipeIDs[value.mainRecipeId],
                      let sideRecipeID = recipeIDs[value.sideRecipeId]
                else { return nil }
                return RecipeRelation(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    mainRecipeID: mainRecipeID,
                    sideRecipeID: sideRecipeID,
                    relationType: value.relationType ?? "side",
                    order: value.order ?? 0,
                    scheduleLeadDays: value.scheduleLeadDays,
                    updatedAt: value.updatedAt ?? value.createdAt ?? .distantPast
                )
            },
            groceryItems: groceryItems.compactMap { value in
                guard let weekID = weekIDs[value.weekId] else { return nil }
                return GroceryItem(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    weekID: weekID,
                    name: value.name,
                    isChecked: value.checked,
                    order: value.order ?? 0,
                    category: value.category ?? "Other",
                    updatedAt: value.updatedAt ?? .distantPast
                )
            },
            recipeBooks: recipeBooks.map { value in
                RecipeBook(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    name: value.name,
                    updatedAt: value.updatedAt ?? value.createdAt ?? .distantPast
                )
            },
            groceryTemplates: groceryTemplates.map { value in
                GroceryTemplate(
                    id: value.clientId ?? value.id,
                    serverID: value.id,
                    name: value.name,
                    categories: value.template,
                    isDefault: value.isDefault,
                    updatedAt: value.updatedAt ?? .distantPast
                )
            },
            versions: versions,
            outbox: []
        )
    }
}

private struct ServerSyncResponse: Decodable {
    var acknowledged: [SyncResponse.Acknowledgement]
    var conflicts: [SyncResponse.Conflict]
    var cursor: String
    var workspace: ServerWorkspaceDTO

    var response: SyncResponse {
        SyncResponse(
            acknowledged: acknowledged,
            conflicts: conflicts,
            cursor: cursor,
            workspace: workspace.workspace
        )
    }
}

@MainActor
@Observable
final class AuthStore {
    enum Phase {
        case loading
        case signedOut
        case signedIn
    }

    private(set) var phase: Phase = .loading
    private(set) var session: MobileSession?
    private(set) var isWorking = false
    private(set) var errorMessage: String?
    @ObservationIgnored let client: any FoodTrackerAPI

    init(client: any FoodTrackerAPI = FoodTrackerAPIClient()) {
        self.client = client
    }

    func restoreSession() async {
        do {
            session = try await client.restoreSession()
            phase = .signedIn
        } catch APIError.unauthorized {
            phase = .signedOut
        } catch {
            phase = .signedOut
            errorMessage = "Sign in to open your kitchen. Your offline data remains on this iPhone."
        }
    }

    func refreshSession() async {
        do {
            session = try await client.restoreSession()
        } catch APIError.unauthorized {
            session = nil
            phase = .signedOut
        } catch {
            // Keep the last known entitlement snapshot while temporarily offline.
        }
    }

    func signIn(email: String, password: String) async -> Bool {
        await authenticate { try await client.signIn(email: email, password: password) }
    }

    func signUp(firstName: String, lastName: String, email: String, password: String) async -> Bool {
        await authenticate {
            try await client.signUp(firstName: firstName, lastName: lastName, email: email, password: password)
        }
    }

    func switchTeam(to teamID: String) async -> Bool {
        guard session?.teams.contains(where: { $0.id == teamID }) == true else {
            errorMessage = "That team is not available to this account."
            return false
        }
        guard session?.teamID != teamID else { return true }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            session = try await client.switchTeam(to: teamID)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func signOut() async {
        isWorking = true
        defer { isWorking = false }
        do { try await client.signOut() }
        catch { errorMessage = error.localizedDescription }
        session = nil
        phase = .signedOut
    }

    func loadAccountDeletionPreview() async -> AccountDeletionPreview? {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            return try await client.loadAccountDeletionPreview()
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func deleteAccount(password: String, confirmation: String = "DELETE") async -> Bool {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let result = try await client.deleteAccount(password: password, confirmation: confirmation)
            guard result.deleted else {
                errorMessage = "List To Ladle could not confirm that your account was deleted."
                return false
            }
            session = nil
            phase = .signedOut
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func clearError() { errorMessage = nil }

    private func authenticate(_ action: () async throws -> MobileSession) async -> Bool {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            session = try await action()
            phase = .signedIn
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}

@MainActor
@Observable
final class ConnectivityMonitor {
    private(set) var isOnline = true
    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private let queue = DispatchQueue(label: "FoodTracker.Connectivity")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.isOnline = path.status == .satisfied }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}
