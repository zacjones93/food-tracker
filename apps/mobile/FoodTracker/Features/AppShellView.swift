import SafariServices
import SwiftUI

struct AppShellView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(AuthStore.self) private var auth
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(DeepLinkRouter.self) private var deepLinks
    @Environment(\.scenePhase) private var scenePhase
    @State private var recipePath: [LinkedRecipeRoute] = []
    @State private var webFallback: LinkedWebFallback?

    var body: some View {
        @Bindable var store = store
        TabView(selection: $store.selectedTab) {
            Tab("Plan", systemImage: "calendar", value: FoodTrackerStore.Tab.schedule) {
                NavigationStack { ScheduleView() }
            }
            Tab("Recipes", systemImage: "book.pages", value: FoodTrackerStore.Tab.recipes) {
                NavigationStack(path: $recipePath) {
                    RecipesView()
                        .navigationDestination(for: LinkedRecipeRoute.self) { route in
                            RecipeDetailView(
                                recipeID: route.recipeID,
                                initiallyEditing: route.wantsEdit && canEditRecipes
                            )
                        }
                }
            }
            if hasAssistantAccess {
                Tab("Assistant", systemImage: "sparkles", value: FoodTrackerStore.Tab.assistant) {
                    NavigationStack {
                        AssistantView()
                    }
                }
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
            Task {
                await auth.refreshSession()
                await synchronize()
            }
        }
        .onChange(of: store.pendingCount) { _, count in
            guard count > 0, connectivity.isOnline else { return }
            Task { await store.sync(using: auth.client) }
        }
        .onChange(of: hasAssistantAccess) { _, canUseAssistant in
            if !canUseAssistant, store.selectedTab == .assistant {
                store.selectedTab = .schedule
            }
        }
        .sheet(item: $webFallback) { fallback in
            LinkedRecipeBrowser(url: fallback.url).ignoresSafeArea()
        }
        .onChange(of: deepLinks.pendingDestination) { _, _ in openPendingDeepLink() }
        .onChange(of: store.recipes) { _, _ in openPendingDeepLink() }
        .task { openPendingDeepLink() }
    }

    private var hasAssistantAccess: Bool {
        auth.session?.entitlements?.features.aiAssistant ?? false
    }

    private var canEditRecipes: Bool {
        auth.session?.permissions.contains("edit_recipes") == true
    }

    private func openPendingDeepLink(allowWebFallback: Bool = false) {
        guard let destination = deepLinks.pendingDestination else { return }
        let match: Recipe?
        let wantsEdit: Bool
        switch destination {
        case let .recipeServerID(serverID, edit):
            match = store.recipes.first { $0.serverID == serverID }
            wantsEdit = edit
        case let .recipeDialID(dialID, edit):
            match = store.recipes.first { $0.dialExternalID == dialID }
            wantsEdit = edit
        }
        guard let match else {
            if allowWebFallback, let url = deepLinks.pendingURL {
                webFallback = LinkedWebFallback(url: url)
                deepLinks.consume()
            }
            return
        }
        store.selectedTab = .recipes
        recipePath = [LinkedRecipeRoute(recipeID: match.id, wantsEdit: wantsEdit)]
        deepLinks.consume()
    }

    private func synchronize() async {
        guard connectivity.isOnline else {
            store.completeInitialLoading()
            return
        }
        await store.sync(using: auth.client)
        await store.refresh(using: auth.client)
        openPendingDeepLink(allowWebFallback: true)
    }
}

private struct LinkedRecipeRoute: Hashable {
    var recipeID: String
    var wantsEdit: Bool
}

private struct LinkedWebFallback: Identifiable {
    let id = UUID()
    var url: URL
}

private struct LinkedRecipeBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
