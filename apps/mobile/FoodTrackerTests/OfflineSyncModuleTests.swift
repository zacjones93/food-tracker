import XCTest
@testable import FoodTracker

final class OfflineSyncModuleTests: XCTestCase {
    func testQueueCoalescesEditsAndKeepsCanonicalBaseVersion() throws {
        let original = Recipe(id: "local_recipe", serverID: "rcp_1", name: "Original")
        var workspace = FoodWorkspace(
            recipes: [original],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            versions: [
                EntityVersion(
                    entityType: .recipe,
                    entityID: "rcp_1",
                    clientID: "local_recipe",
                    version: 7,
                    deletedAt: nil,
                    updatedAt: .now
                )
            ],
            outbox: []
        )
        let sync = OfflineSyncModule()

        var firstEdit = original
        firstEdit.name = "First edit"
        try sync.enqueue(.recipe, value: firstEdit, in: &workspace)
        let mutationID = try XCTUnwrap(workspace.outbox.first?.id)

        var secondEdit = firstEdit
        secondEdit.name = "Second edit"
        try sync.enqueue(.recipe, value: secondEdit, in: &workspace)

        XCTAssertEqual(workspace.outbox.count, 1)
        XCTAssertEqual(workspace.outbox.first?.id, mutationID)
        XCTAssertEqual(workspace.outbox.first?.baseVersion, 7)
    }

    func testDeletingAnUnsyncedCreateRemovesItWithoutCreatingATombstone() throws {
        var workspace = FoodWorkspace.empty
        let sync = OfflineSyncModule()
        let recipe = Recipe(id: "local_recipe", name: "Local")

        try sync.enqueue(.recipe, value: recipe, in: &workspace)
        sync.enqueueDelete(.recipe, id: recipe.id, serverID: nil, in: &workspace)

        XCTAssertTrue(workspace.outbox.isEmpty)
    }

    func testRemoteMergePreservesPendingLocalValuesAndAdoptsCanonicalID() throws {
        let local = Recipe(id: "local_recipe", name: "Local edit")
        var workspace = FoodWorkspace(
            recipes: [local],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        let sync = OfflineSyncModule()
        try sync.enqueue(.recipe, value: local, in: &workspace)

        let remote = FoodWorkspace(
            cursor: "12",
            recipes: [Recipe(id: "local_recipe", serverID: "rcp_1", name: "Remote value")],
            weeks: [],
            scheduledRecipes: [],
            groceryItems: [],
            recipeBooks: [],
            groceryTemplates: [],
            outbox: []
        )
        sync.merge(remote, into: &workspace)

        XCTAssertEqual(workspace.recipes.map(\.name), ["Local edit"])
        XCTAssertEqual(workspace.recipes.first?.serverID, "rcp_1")
        XCTAssertEqual(workspace.cursor, "12")
    }
}
