import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
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
        .task { await auth.restoreSession() }
    }
}
