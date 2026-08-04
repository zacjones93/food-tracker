import SwiftUI
import UIKit

struct NotificationSettingsView: View {
    @Environment(PushNotificationCoordinator.self) private var pushNotifications

    var body: some View {
        List {
            Section("This device") {
                LabeledContent("Status", value: pushNotifications.state.description)

                if pushNotifications.state == .denied {
                    Button("Open iOS Settings") {
                        guard let URL = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(URL)
                    }
                } else if pushNotifications.isRegistered {
                    Button("Disable for this account", role: .destructive) {
                        Task { await pushNotifications.disableForCurrentAccount() }
                    }
                } else {
                    Button("Enable push notifications") {
                        Task { await pushNotifications.enable() }
                    }
                    .disabled(pushNotifications.state == .registering)
                }
            }

            Section {
                Text("List To Ladle uses Apple Push Notification service for household schedule reminders. Permission is optional and can be revoked at any time.")
                    .font(.footnote)
                    .foregroundStyle(Color.foodSecondaryInk)
            }
        }
        .foodListBackground()
        .navigationTitle("Notifications")
        .task { await pushNotifications.refreshAuthorizationStatus() }
    }
}
