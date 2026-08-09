import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(PushNotificationCoordinator.self) private var pushNotifications

    var body: some View {
        Group {
            #if DEBUG
            if ProcessInfo.processInfo.environment["SCREENSHOT_COFFEE_EDITOR"] == "1" {
                RecipeEditor(
                    recipe: Recipe(
                        id: "screenshot_coffee_drink",
                        serverID: "rcp_screenshot_coffee_drink",
                        name: "Brown Sugar Shakerato",
                        emoji: "☕️",
                        visibility: "public",
                        recipeType: .coffeeDrink
                    )
                )
                .environment(FoodTrackerStore.preview)
            } else {
                authenticatedContent
            }
            #else
            authenticatedContent
            #endif
        }
        .keyboardDismissToolbar()
        .task { await auth.restoreSession() }
        .task(id: auth.session?.user.id) {
            guard let userID = auth.session?.user.id else {
                pushNotifications.deactivate()
                return
            }
            await pushNotifications.activate(userID: userID)
        }
    }

    @ViewBuilder
    private var authenticatedContent: some View {
        Group {
            switch auth.phase {
            case .loading:
                VStack(spacing: FoodSpacing.medium) {
                    Image("BrandLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 76, height: 76)
                        .background(Color.foodDeep)
                        .clipShape(.rect(cornerRadius: 18))
                        .accessibilityLabel("List To Ladle")
                    ProgressView("Opening your kitchen…")
                }
            case .signedOut:
                AuthView()
            case .signedIn:
                AppShellView()
            }
        }
    }
}
