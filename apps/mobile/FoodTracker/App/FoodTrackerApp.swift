import SwiftUI

@main
struct FoodTrackerApp: App {
    @State private var auth = AuthStore()
    @State private var store = FoodTrackerStore()
    @State private var connectivity = ConnectivityMonitor()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(store)
                .environment(connectivity)
                .tint(Color.foodAccent)
                .preferredColorScheme(nil)
        }
    }
}
