import Foundation
import CoreFoundation

protocol SyncEntity: Identifiable, Codable, Hashable, Sendable where ID == String {
    var id: String { get }
    var serverID: String? { get set }
    var updatedAt: Date { get set }
}

struct IngredientSection: Codable, Hashable, Sendable, Identifiable {
    var id = UUID()
    var title: String
    var items: [String]

    private enum CodingKeys: String, CodingKey { case title, items }

    init(id: UUID = UUID(), title: String, items: [String]) {
        self.id = id
        self.title = title
        self.items = items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        items = try container.decode([String].self, forKey: .items)
    }
}

struct Recipe: SyncEntity {
    var id: String
    var serverID: String?
    var name: String
    var emoji: String
    var tags: [String]
    var mealType: String
    var difficulty: String
    var visibility: String
    var recipeLink: String
    var recipeBookID: String?
    var page: String
    var lastMadeDate: Date?
    var mealsEatenCount: Int
    var ingredients: [IngredientSection]
    var instructions: String
    var updatedAt: Date

    init(
        id: String = "local_recipe_\(UUID().uuidString.lowercased())",
        serverID: String? = nil,
        name: String,
        emoji: String = "🍽️",
        tags: [String] = [],
        mealType: String = "Dinner",
        difficulty: String = "Easy",
        visibility: String = "private",
        recipeLink: String = "",
        recipeBookID: String? = nil,
        page: String = "",
        lastMadeDate: Date? = nil,
        mealsEatenCount: Int = 0,
        ingredients: [IngredientSection] = [],
        instructions: String = "",
        updatedAt: Date = .now
    ) {
        self.id = id
        self.serverID = serverID
        self.name = name
        self.emoji = emoji
        self.tags = tags
        self.mealType = mealType
        self.difficulty = difficulty
        self.visibility = visibility
        self.recipeLink = recipeLink
        self.recipeBookID = recipeBookID
        self.page = page
        self.lastMadeDate = lastMadeDate
        self.mealsEatenCount = mealsEatenCount
        self.ingredients = ingredients
        self.instructions = instructions
        self.updatedAt = updatedAt
    }
}

struct WeekPlan: SyncEntity {
    enum Status: String, Codable, CaseIterable, Identifiable, Sendable {
        case current
        case upcoming
        case archived

        var id: Self { self }
        var label: String { rawValue.capitalized }
    }

    var id: String
    var serverID: String?
    var name: String
    var emoji: String
    var status: Status
    var startDate: Date?
    var endDate: Date?
    var weekNumber: Int?
    var updatedAt: Date

    init(
        id: String = "local_week_\(UUID().uuidString.lowercased())",
        serverID: String? = nil,
        name: String,
        emoji: String = "🗓️",
        status: Status = .upcoming,
        startDate: Date? = nil,
        endDate: Date? = nil,
        weekNumber: Int? = nil,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.serverID = serverID
        self.name = name
        self.emoji = emoji
        self.status = status
        self.startDate = startDate
        self.endDate = endDate
        self.weekNumber = weekNumber
        self.updatedAt = updatedAt
    }
}

struct ScheduledRecipe: SyncEntity {
    var id: String
    var serverID: String?
    var weekID: String
    var recipeID: String
    var scheduledDate: Date?
    var order: Int
    var made: Bool
    var updatedAt: Date

    init(
        id: String = "local_week_recipe_\(UUID().uuidString.lowercased())",
        serverID: String? = nil,
        weekID: String,
        recipeID: String,
        scheduledDate: Date? = nil,
        order: Int = 0,
        made: Bool = false,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.serverID = serverID
        self.weekID = weekID
        self.recipeID = recipeID
        self.scheduledDate = scheduledDate
        self.order = order
        self.made = made
        self.updatedAt = updatedAt
    }
}

struct GroceryItem: SyncEntity {
    var id: String
    var serverID: String?
    var weekID: String
    var name: String
    var isChecked: Bool
    var order: Int
    var category: String
    var updatedAt: Date

    init(
        id: String = "local_grocery_\(UUID().uuidString.lowercased())",
        serverID: String? = nil,
        weekID: String,
        name: String,
        isChecked: Bool = false,
        order: Int = 0,
        category: String = "Other",
        updatedAt: Date = .now
    ) {
        self.id = id
        self.serverID = serverID
        self.weekID = weekID
        self.name = name
        self.isChecked = isChecked
        self.order = order
        self.category = category
        self.updatedAt = updatedAt
    }
}

struct RecipeBook: SyncEntity {
    var id: String
    var serverID: String?
    var name: String
    var updatedAt: Date

    init(
        id: String = "local_book_\(UUID().uuidString.lowercased())",
        serverID: String? = nil,
        name: String,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.serverID = serverID
        self.name = name
        self.updatedAt = updatedAt
    }
}

struct GroceryTemplateItem: Codable, Hashable, Sendable, Identifiable {
    var id = UUID()
    var name: String
    var order: Int

    private enum CodingKeys: String, CodingKey { case name, order }

    init(id: UUID = UUID(), name: String, order: Int) {
        self.id = id
        self.name = name
        self.order = order
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        order = try container.decodeIfPresent(Int.self, forKey: .order) ?? 0
    }
}

struct GroceryTemplateCategory: Codable, Hashable, Sendable, Identifiable {
    var id = UUID()
    var category: String
    var order: Int
    var items: [GroceryTemplateItem]

    private enum CodingKeys: String, CodingKey { case category, order, items }

    init(id: UUID = UUID(), category: String, order: Int, items: [GroceryTemplateItem]) {
        self.id = id
        self.category = category
        self.order = order
        self.items = items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        category = try container.decode(String.self, forKey: .category)
        order = try container.decodeIfPresent(Int.self, forKey: .order) ?? 0
        items = try container.decode([GroceryTemplateItem].self, forKey: .items)
    }
}

struct GroceryTemplate: SyncEntity {
    var id: String
    var serverID: String?
    var name: String
    var categories: [GroceryTemplateCategory]
    var isDefault: Bool
    var updatedAt: Date

    init(
        id: String = "local_template_\(UUID().uuidString.lowercased())",
        serverID: String? = nil,
        name: String,
        categories: [GroceryTemplateCategory] = [],
        isDefault: Bool = false,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.serverID = serverID
        self.name = name
        self.categories = categories
        self.isDefault = isDefault
        self.updatedAt = updatedAt
    }
}

struct MobileSession: Codable, Hashable, Sendable {
    struct User: Codable, Hashable, Sendable {
        var id: String
        var email: String
        var firstName: String?
        var lastName: String?
        var avatar: String?

        var name: String {
            let fullName = [firstName, lastName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
            return fullName.isEmpty ? email : fullName
        }

        var avatarURL: URL? { avatar.flatMap(URL.init(string:)) }
    }

    struct Team: Codable, Hashable, Sendable {
        var id: String
        var name: String
        var slug: String
        var avatarURL: String?
        var roleID: String?

        private enum CodingKeys: String, CodingKey {
            case id, name, slug
            case avatarURL = "avatarUrl"
            case roleID = "roleId"
        }
    }

    var protocolVersion: Int
    var user: User
    var activeTeam: Team
    var teams: [Team]
    var permissions: [String]

    var teamID: String { activeTeam.id }
    var teamName: String { activeTeam.name }
}

struct AssistantMessage: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var role: String
    var text: String

    init(id: String = UUID().uuidString.lowercased(), role: String, text: String) {
        self.id = id
        self.role = role
        self.text = text
    }
}

enum SyncEntityKind: String, Codable, Sendable {
    case recipe
    case week
    case scheduledRecipe = "weekRecipe"
    case groceryItem
    case recipeBook
    case groceryTemplate
}

enum SyncOperation: String, Codable, Sendable {
    case create
    case update
    case delete
}

struct PendingMutation: Codable, Hashable, Identifiable, Sendable {
    var id: UUID
    var entity: SyncEntityKind
    var entityID: String
    var serverEntityID: String?
    var operation: SyncOperation
    var baseVersion: Int
    var payload: JSONValue?

    init<Entity: SyncEntity>(entity: SyncEntityKind, value: Entity) throws {
        id = UUID()
        self.entity = entity
        entityID = value.id
        serverEntityID = value.serverID
        operation = value.serverID == nil ? .create : .update
        baseVersion = 0
        payload = try SyncPayload.make(for: value)
    }

    init(entity: SyncEntityKind, entityID: String, serverEntityID: String?) {
        id = UUID()
        self.entity = entity
        self.entityID = entityID
        self.serverEntityID = serverEntityID
        operation = .delete
        baseVersion = 0
        payload = .object([:])
    }

    private enum CodingKeys: String, CodingKey {
        case id = "mutationId"
        case entity = "entityType"
        case entityID = "clientEntityId"
        case serverEntityID = "serverEntityId"
        case operation
        case baseVersion
        case payload
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(entity, forKey: .entity)
        try container.encode(operation, forKey: .operation)
        // Keep the stable client ID on every operation so persisted mutations can
        // still be matched back to local records after an app relaunch.
        try container.encode(entityID, forKey: .entityID)
        if operation != .create { try container.encode(serverEntityID ?? entityID, forKey: .serverEntityID) }
        try container.encode(baseVersion, forKey: .baseVersion)
        try container.encode(payload ?? .object([:]), forKey: .payload)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        entity = try container.decode(SyncEntityKind.self, forKey: .entity)
        operation = try container.decode(SyncOperation.self, forKey: .operation)
        entityID = try container.decodeIfPresent(String.self, forKey: .entityID)
            ?? container.decodeIfPresent(String.self, forKey: .serverEntityID)
            ?? ""
        serverEntityID = try container.decodeIfPresent(String.self, forKey: .serverEntityID)
        baseVersion = try container.decodeIfPresent(Int.self, forKey: .baseVersion) ?? 0
        payload = try container.decodeIfPresent(JSONValue.self, forKey: .payload)
    }
}

private enum SyncPayload {
    static func make<Entity: SyncEntity>(for value: Entity) throws -> JSONValue {
        if let recipe = value as? Recipe {
            return .object([
                "name": .string(recipe.name),
                "emoji": .string(recipe.emoji),
                "tags": .array(recipe.tags.map(JSONValue.string)),
                "mealType": .string(recipe.mealType),
                "difficulty": .string(recipe.difficulty),
                "visibility": .string(recipe.visibility),
                "recipeLink": recipe.recipeLink.isEmpty ? .null : .string(recipe.recipeLink),
                "recipeBookId": recipe.recipeBookID.map(JSONValue.string) ?? .null,
                "page": recipe.page.isEmpty ? .null : .string(recipe.page),
                "lastMadeDate": date(recipe.lastMadeDate),
                "mealsEatenCount": .number(Double(recipe.mealsEatenCount)),
                "ingredients": .array(recipe.ingredients.map { section in
                    .object(["title": .string(section.title), "items": .array(section.items.map(JSONValue.string))])
                }),
                "recipeBody": recipe.instructions.isEmpty ? .null : .string(recipe.instructions)
            ])
        }
        if let week = value as? WeekPlan {
            return .object([
                "name": .string(week.name),
                "emoji": .string(week.emoji),
                "status": .string(week.status.rawValue),
                "startDate": date(week.startDate),
                "endDate": date(week.endDate),
                "weekNumber": week.weekNumber.map { .number(Double($0)) } ?? .null
            ])
        }
        if let scheduled = value as? ScheduledRecipe {
            return .object([
                "weekId": .string(scheduled.weekID),
                "recipeId": .string(scheduled.recipeID),
                "scheduledDate": date(scheduled.scheduledDate),
                "order": .number(Double(scheduled.order)),
                "made": .bool(scheduled.made)
            ])
        }
        if let item = value as? GroceryItem {
            return .object([
                "weekId": .string(item.weekID),
                "name": .string(item.name),
                "checked": .bool(item.isChecked),
                "order": .number(Double(item.order)),
                "category": .string(item.category)
            ])
        }
        if let book = value as? RecipeBook { return .object(["name": .string(book.name)]) }
        if let template = value as? GroceryTemplate {
            return .object([
                "name": .string(template.name),
                "template": .array(template.categories.map { category in
                    .object([
                        "category": .string(category.category),
                        "order": .number(Double(category.order)),
                        "items": .array(category.items.map { item in
                            .object(["name": .string(item.name), "order": .number(Double(item.order))])
                        })
                    ])
                }),
                "isDefault": .bool(template.isDefault)
            ])
        }
        throw CocoaError(.coderInvalidValue)
    }

    private static func date(_ value: Date?) -> JSONValue {
        value.map { .string(ISO8601DateFormatter().string(from: $0)) } ?? .null
    }
}

enum JSONValue: Codable, Hashable, Sendable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(any: Any) throws {
        switch any {
        case let value as [String: Any]:
            self = try .object(value.mapValues(JSONValue.init(any:)))
        case let value as [Any]:
            self = try .array(value.map(JSONValue.init(any:)))
        case let value as String:
            self = .string(value)
        case let value as NSNumber:
            self = CFGetTypeID(value) == CFBooleanGetTypeID() ? .bool(value.boolValue) : .number(value.doubleValue)
        case _ as NSNull:
            self = .null
        default:
            throw CocoaError(.coderInvalidValue)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else { self = .string(try container.decode(String.self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

struct FoodWorkspace: Codable, Sendable {
    var version = 1
    var cursor: String?
    var recipes: [Recipe]
    var weeks: [WeekPlan]
    var scheduledRecipes: [ScheduledRecipe]
    var groceryItems: [GroceryItem]
    var recipeBooks: [RecipeBook]
    var groceryTemplates: [GroceryTemplate]
    var versions: [EntityVersion]? = nil
    var outbox: [PendingMutation]

    static let empty = FoodWorkspace(
        recipes: [],
        weeks: [],
        scheduledRecipes: [],
        groceryItems: [],
        recipeBooks: [],
        groceryTemplates: [],
        outbox: []
    )
}

struct EntityVersion: Codable, Hashable, Sendable {
    var entityType: SyncEntityKind
    var entityID: String
    var clientID: String?
    var version: Int
    var deletedAt: Date?
    var updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case entityType
        case entityID = "entityId"
        case clientID = "clientId"
        case version, deletedAt, updatedAt
    }
}

struct SyncEnvelope: Codable, Sendable {
    var cursor: String?
    var mutations: [PendingMutation]
}

struct SyncResponse: Sendable {
    struct Acknowledgement: Decodable, Sendable {
        var mutationID: UUID
        var entityID: String
        var serverID: String?

        private enum CodingKeys: String, CodingKey {
            case mutationID = "mutationId"
            case clientEntityID = "clientEntityId"
            case serverID = "serverEntityId"
        }

        init(mutationID: UUID, entityID: String, serverID: String?) {
            self.mutationID = mutationID
            self.entityID = entityID
            self.serverID = serverID
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            mutationID = try container.decode(UUID.self, forKey: .mutationID)
            serverID = try container.decodeIfPresent(String.self, forKey: .serverID)
            entityID = try container.decodeIfPresent(String.self, forKey: .clientEntityID) ?? serverID ?? ""
        }
    }

    struct Conflict: Decodable, Sendable {
        var mutationID: UUID
        var reason: String

        private enum CodingKeys: String, CodingKey {
            case mutationID = "mutationId"
            case reason
        }
    }

    var acknowledged: [Acknowledgement]
    var conflicts: [Conflict]
    var cursor: String?
    var workspace: FoodWorkspace?

    init(
        acknowledged: [Acknowledgement],
        conflicts: [Conflict] = [],
        cursor: String?,
        workspace: FoodWorkspace?
    ) {
        self.acknowledged = acknowledged
        self.conflicts = conflicts
        self.cursor = cursor
        self.workspace = workspace
    }
}

enum FoodTrackerCoding {
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            if let number = try? container.decode(Double.self) {
                return Date(timeIntervalSince1970: number > 10_000_000_000 ? number / 1_000 : number)
            }
            let value = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) { return date }
            let standard = ISO8601DateFormatter()
            standard.formatOptions = [.withInternetDateTime]
            guard let date = standard.date(from: value) else { throw CocoaError(.coderInvalidValue) }
            return date
        }
        return decoder
    }()
}
