import SwiftUI

struct AppShellView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(AuthStore.self) private var auth
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var store = store
        TabView(selection: $store.selectedTab) {
            Tab("Plan", systemImage: "calendar", value: FoodTrackerStore.Tab.schedule) {
                NavigationStack { ScheduleView() }
            }
            Tab("Recipes", systemImage: "book.pages", value: FoodTrackerStore.Tab.recipes) {
                NavigationStack { RecipesView() }
            }
            Tab("Assistant", systemImage: "sparkles", value: FoodTrackerStore.Tab.assistant) {
                NavigationStack { AssistantView() }
            }
            Tab("More", systemImage: "ellipsis", value: FoodTrackerStore.Tab.more) {
                NavigationStack { LibrarySettingsView() }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .alert("Sync paused", isPresented: Binding(
            get: { store.syncMessage != nil },
            set: { if !$0 { store.clearMessages() } }
        )) {
            Button("OK") { store.clearMessages() }
        } message: {
            Text(store.syncMessage ?? "Your changes will sync when the connection returns.")
        }
        .alert("Storage issue", isPresented: Binding(
            get: { store.persistenceMessage != nil },
            set: { if !$0 { store.clearMessages() } }
        )) {
            Button("OK") { store.clearMessages() }
        } message: {
            Text(store.persistenceMessage ?? "Your kitchen could not be saved.")
        }
        .task(id: auth.session?.teamID) {
            guard let session = auth.session else { return }
            store.activateWorkspace(userID: session.user.id, teamID: session.teamID)
            await synchronize()
        }
        .onChange(of: connectivity.isOnline) { _, online in
            guard online else { return }
            Task { await synchronize() }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, connectivity.isOnline else { return }
            Task { await synchronize() }
        }
        .onChange(of: store.pendingCount) { _, count in
            guard count > 0, connectivity.isOnline else { return }
            Task { await store.sync(using: auth.client) }
        }
    }

    private func synchronize() async {
        guard connectivity.isOnline else {
            store.completeInitialLoading()
            return
        }
        await store.sync(using: auth.client)
        await store.refresh(using: auth.client)
    }
}
