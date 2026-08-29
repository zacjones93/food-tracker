import Foundation

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

struct OfflineSyncModule {
    private var storage: (any WorkspacePersisting)?

    init(storage: (any WorkspacePersisting)? = nil) {
        self.storage = storage
    }

    mutating func use(storage: (any WorkspacePersisting)?) {
        self.storage = storage
    }

    func load() throws -> FoodWorkspace? {
        try storage?.load()
    }

    func persist(_ workspace: FoodWorkspace) throws {
        try storage?.save(workspace)
    }

    func enqueue<Entity: SyncEntity>(
        _ kind: SyncEntityKind,
        value: Entity,
        in workspace: inout FoodWorkspace
    ) throws {
        var mutation = try PendingMutation(entity: kind, value: value)
        mutation.baseVersion = version(for: kind, value: value, in: workspace)
        if let existing = workspace.outbox.first(where: {
            $0.entity == kind && $0.entityID == value.id
        }) {
            mutation.id = existing.id
        }
        workspace.outbox.removeAll { $0.entity == kind && $0.entityID == value.id }
        workspace.outbox.append(mutation)
    }

    func enqueueDelete(
        _ kind: SyncEntityKind,
        id: String,
        serverID: String?,
        in workspace: inout FoodWorkspace
    ) {
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

    func reconcile(_ response: SyncResponse, in workspace: inout FoodWorkspace) {
        for acknowledgement in response.acknowledged {
            apply(acknowledgement, to: &workspace)
        }
        let acknowledgedIDs = Set(response.acknowledged.map(\.mutationID))
        workspace.outbox.removeAll { acknowledgedIDs.contains($0.id) }
        workspace.cursor = response.cursor ?? workspace.cursor
        if let remote = response.workspace { merge(remote, into: &workspace) }
    }

    func merge(_ remote: FoodWorkspace, into workspace: inout FoodWorkspace) {
        let pending = Dictionary(grouping: workspace.outbox, by: { $0.entity })
            .mapValues { Set($0.map(\.entityID)) }
        workspace.recipes = merged(
            remote.recipes,
            local: workspace.recipes,
            pending: pending[.recipe] ?? []
        )
        workspace.weeks = merged(
            remote.weeks,
            local: workspace.weeks,
            pending: pending[.week] ?? []
        )
        workspace.scheduledRecipes = merged(
            remote.scheduledRecipes,
            local: workspace.scheduledRecipes,
            pending: pending[.scheduledRecipe] ?? []
        )
        workspace.recipeRelations = merged(
            remote.recipeRelations,
            local: workspace.recipeRelations,
            pending: pending[.recipeRelation] ?? []
        )
        workspace.groceryItems = merged(
            remote.groceryItems,
            local: workspace.groceryItems,
            pending: pending[.groceryItem] ?? []
        )
        workspace.recipeBooks = merged(
            remote.recipeBooks,
            local: workspace.recipeBooks,
            pending: pending[.recipeBook] ?? []
        )
        workspace.groceryTemplates = merged(
            remote.groceryTemplates,
            local: workspace.groceryTemplates,
            pending: pending[.groceryTemplate] ?? []
        )
        workspace.versions = remote.versions ?? workspace.versions
        workspace.cursor = remote.cursor ?? workspace.cursor
    }

    private func apply(
        _ acknowledgement: SyncResponse.Acknowledgement,
        to workspace: inout FoodWorkspace
    ) {
        guard let kind = workspace.outbox.first(where: {
            $0.id == acknowledgement.mutationID
        })?.entity else { return }
        switch kind {
        case .recipe:
            setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.recipes)
        case .week:
            setServerID(acknowledgement.serverID, id: acknowledgement.entityID, in: &workspace.weeks)
        case .scheduledRecipe:
            setServerID(
                acknowledgement.serverID,
                id: acknowledgement.entityID,
                in: &workspace.scheduledRecipes
            )
        case .recipeRelation:
            setServerID(
                acknowledgement.serverID,
                id: acknowledgement.entityID,
                in: &workspace.recipeRelations
            )
        case .groceryItem:
            setServerID(
                acknowledgement.serverID,
                id: acknowledgement.entityID,
                in: &workspace.groceryItems
            )
        case .recipeBook:
            setServerID(
                acknowledgement.serverID,
                id: acknowledgement.entityID,
                in: &workspace.recipeBooks
            )
        case .groceryTemplate:
            setServerID(
                acknowledgement.serverID,
                id: acknowledgement.entityID,
                in: &workspace.groceryTemplates
            )
        }
    }

    private func setServerID<Entity: SyncEntity>(
        _ serverID: String?,
        id: String,
        in values: inout [Entity]
    ) {
        guard let serverID, let index = values.firstIndex(where: { $0.id == id }) else { return }
        values[index].serverID = serverID
    }

    private func version<Entity: SyncEntity>(
        for kind: SyncEntityKind,
        value: Entity,
        in workspace: FoodWorkspace
    ) -> Int {
        workspace.versions?.first {
            $0.entityType == kind && ($0.clientID == value.id || $0.entityID == value.serverID)
        }?.version ?? 0
    }

    private func merged<Entity: SyncEntity>(
        _ remote: [Entity],
        local: [Entity],
        pending: Set<String>
    ) -> [Entity] {
        var result = remote
        for localValue in local {
            let remoteIndex = result.firstIndex {
                $0.id == localValue.id ||
                    (localValue.serverID != nil && (
                        $0.serverID == localValue.serverID || $0.id == localValue.serverID
                    ))
            }
            if pending.contains(localValue.id) {
                if let remoteIndex {
                    var pendingValue = localValue
                    pendingValue.serverID = pendingValue.serverID
                        ?? result[remoteIndex].serverID
                        ?? result[remoteIndex].id
                    result[remoteIndex] = pendingValue
                } else {
                    result.append(localValue)
                }
            }
        }
        return result
    }
}
