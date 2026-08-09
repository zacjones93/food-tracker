import SwiftUI

@main
struct FoodTrackerApp: App {
    @UIApplicationDelegateAdaptor(FoodTrackerAppDelegate.self) private var appDelegate
    @State private var auth = AuthStore()
    @State private var store = FoodTrackerStore()
    @State private var connectivity = ConnectivityMonitor()
    @State private var pushNotifications = PushNotificationCoordinator()
    @State private var deepLinks = DeepLinkRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(store)
                .environment(connectivity)
                .environment(pushNotifications)
                .environment(deepLinks)
                .tint(Color.foodAccent)
                .preferredColorScheme(nil)
                .task { appDelegate.connect(to: pushNotifications) }
                .onOpenURL { deepLinks.handle($0) }
        }
    }
}
