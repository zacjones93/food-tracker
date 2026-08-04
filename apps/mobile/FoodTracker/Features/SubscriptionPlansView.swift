import StoreKit
import SwiftUI

struct SubscriptionPlansView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(SubscriptionStore.self) private var subscriptions
    @State private var isManagingSubscription = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: FoodSpacing.small) {
                    Image(systemName: "fork.knife.circle.fill")
                        .font(.system(size: 42))
                        .foregroundStyle(Color.foodAccent)
                    Text("List To Ladle Pro")
                        .font(.title2.bold())
                    Text("One subscription unlocks unlimited week creation, the AI assistant, and push notifications for everyone on your active team.")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, FoodSpacing.small)
            }

            Section("Plans") {
                if subscriptions.isLoading {
                    HStack {
                        ProgressView()
                        Text("Loading App Store plans…")
                    }
                } else if subscriptions.products.isEmpty {
                    ContentUnavailableView(
                        "Plans unavailable",
                        systemImage: "cart.badge.questionmark",
                        description: Text(subscriptions.errorMessage ?? "No products are available for this storefront.")
                    )
                } else {
                    ForEach(subscriptions.products, id: \.id) { product in
                        productRow(product)
                    }
                }
            }

            Section {
                Button {
                    Task {
                        if await subscriptions.restorePurchases() {
                            await auth.refreshSession()
                        }
                    }
                } label: {
                    if subscriptions.isRestoring {
                        Label("Restoring purchases…", systemImage: "arrow.clockwise")
                    } else {
                        Label("Restore purchases", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(subscriptions.isRestoring || subscriptions.isPurchasing)

                if auth.session?.entitlements?.providers?.contains("apple") == true {
                    Button("Manage App Store subscription", systemImage: "person.crop.circle.badge.checkmark") {
                        isManagingSubscription = true
                    }
                }
            }

            Section("Subscription terms") {
                Text("Payment is charged to your Apple Account when you confirm. Auto-renewable subscriptions renew unless cancelled at least 24 hours before the current period ends. You can manage or cancel in Apple subscription settings.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("Terms of Use", destination: FoodTrackerAPIClient.defaultBaseURL.appending(path: "/terms"))
                Link("Privacy Policy", destination: FoodTrackerAPIClient.defaultBaseURL.appending(path: "/privacy"))
            }
        }
        .foodListBackground()
        .navigationTitle("Subscription")
        .manageSubscriptionsSheet(isPresented: $isManagingSubscription)
        .alert("Subscription issue", isPresented: Binding(
            get: { subscriptions.errorMessage != nil },
            set: { if !$0 { subscriptions.clearError() } }
        )) {
            Button("OK") { subscriptions.clearError() }
        } message: {
            Text(subscriptions.errorMessage ?? "Please try again.")
        }
    }

    @ViewBuilder
    private func productRow(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: FoodSpacing.small) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                    Text(product.displayName).font(.headline)
                    if let period = product.subscription?.subscriptionPeriod {
                        Text("\(product.displayPrice) every \(subscriptionPeriodLabel(value: period.value, unit: period.unit))")
                            .foregroundStyle(.secondary)
                    } else {
                        Text(product.displayPrice).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button("Subscribe") {
                    Task {
                        if await subscriptions.purchase(product) {
                            await auth.refreshSession()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(subscriptions.isPurchasing || subscriptions.isRestoring)
            }
            if !product.description.isEmpty {
                Text(product.description)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, FoodSpacing.extraSmall)
    }
}
