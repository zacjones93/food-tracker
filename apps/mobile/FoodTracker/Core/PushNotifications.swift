import Foundation
import Observation
import UIKit
@preconcurrency import UserNotifications

enum PushAuthorizationState: Equatable {
    case authorized
    case denied
    case failed(String)
    case notDetermined
    case registered
    case registering

    var description: String {
        switch self {
        case .authorized: "Allowed on this device"
        case .denied: "Disabled in iOS Settings"
        case .failed(let message): message
        case .notDetermined: "Not enabled"
        case .registered: "Enabled for this account"
        case .registering: "Enabling…"
        }
    }
}

enum PushNotificationAvailability {
    #if PUSH_NOTIFICATIONS_AVAILABLE
    static let isEnabled = true
    #else
    static let isEnabled = false
    #endif
}

@MainActor
@Observable
final class PushNotificationCoordinator {
    private(set) var state: PushAuthorizationState = .notDetermined

    @ObservationIgnored private let client: PushDeviceAPIClient
    @ObservationIgnored private let installationID: String
    @ObservationIgnored private var activeUserID: String?
    @ObservationIgnored private var deviceToken: String?

    init(
        client: PushDeviceAPIClient = PushDeviceAPIClient(),
        installationID: String = PushInstallation.identifier()
    ) {
        self.client = client
        self.installationID = installationID
    }

    var isRegistered: Bool { state == .registered }

    func activate(userID: String) async {
        guard PushNotificationAvailability.isEnabled else { return }
        activeUserID = userID
        await refreshAuthorizationStatus()
        guard state == .authorized || state == .registered else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func deactivate() {
        activeUserID = nil
        deviceToken = nil
        if state == .registered { state = .authorized }
    }

    func enable() async {
        guard PushNotificationAvailability.isEnabled else { return }
        do {
            let isAuthorized = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            guard isAuthorized else {
                state = .denied
                return
            }
            state = .registering
            UIApplication.shared.registerForRemoteNotifications()
        } catch {
            state = .failed("iOS could not enable notifications. Please try again.")
        }
    }

    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .ephemeral, .provisional:
            if state != .registered && state != .registering { state = .authorized }
        case .denied:
            state = .denied
        case .notDetermined:
            state = .notDetermined
        @unknown default:
            state = .failed("Notification permission is unavailable.")
        }
    }

    func receive(deviceToken data: Data) {
        deviceToken = hexadecimalDeviceToken(data)
        Task { await registerCurrentToken() }
    }

    func registrationFailed() {
        state = .failed("This device could not register with Apple Push Notification service.")
    }

    func disableForCurrentAccount() async {
        guard let activeUserID else { return }

        do {
            try await client.unregister(
                registration: PushDeviceRegistration(
                    bundleId: PushDeviceRegistration.bundleId,
                    environment: PushDeviceRegistration.environment,
                    installationId: installationID,
                    token: nil
                )
            )
            guard self.activeUserID == activeUserID else { return }
            state = .authorized
        } catch {
            state = .failed("The server could not disable notifications for this account.")
        }
    }

    private func registerCurrentToken() async {
        guard let activeUserID, let deviceToken else { return }
        state = .registering

        do {
            try await client.register(
                registration: PushDeviceRegistration(
                    bundleId: PushDeviceRegistration.bundleId,
                    environment: PushDeviceRegistration.environment,
                    installationId: installationID,
                    token: deviceToken
                )
            )
            guard self.activeUserID == activeUserID else { return }
            state = .registered
        } catch APIError.unauthorized {
            state = .failed("Sign in again to enable notifications.")
        } catch {
            state = .failed("The server could not register this device. Please try again.")
        }
    }
}

@MainActor
final class FoodTrackerAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private var pendingDeviceToken: Data?
    private weak var pushNotifications: PushNotificationCoordinator?

    func connect(to pushNotifications: PushNotificationCoordinator) {
        self.pushNotifications = pushNotifications
        UNUserNotificationCenter.current().delegate = self
        if let pendingDeviceToken {
            self.pendingDeviceToken = nil
            pushNotifications.receive(deviceToken: pendingDeviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        guard let pushNotifications else {
            pendingDeviceToken = deviceToken
            return
        }
        pushNotifications.receive(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        pushNotifications?.registrationFailed()
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

struct PushDeviceRegistration: Codable, Equatable, Sendable {
    static let bundleId = "com.wodsmith.listtoladle"
#if DEBUG
    static let environment = "sandbox"
#else
    static let environment = "production"
#endif

    var bundleId: String
    var environment: String
    var installationId: String
    var token: String?
}

enum PushInstallation {
    private static let defaultsKey = "push-installation-id"

    static func identifier(defaults: UserDefaults = .standard) -> String {
        if let value = defaults.string(forKey: defaultsKey), UUID(uuidString: value) != nil {
            return value
        }

        let value = UUID().uuidString.lowercased()
        defaults.set(value, forKey: defaultsKey)
        return value
    }
}

struct PushDeviceAPIClient: Sendable {
    let baseURL: URL
    let session: URLSession

    init(
        baseURL: URL = FoodTrackerAPIClient.defaultBaseURL,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
    }

    func register(registration: PushDeviceRegistration) async throws {
        try await send(method: "PUT", registration: registration)
    }

    func unregister(registration: PushDeviceRegistration) async throws {
        try await send(method: "DELETE", registration: registration)
    }

    private func send(method: String, registration: PushDeviceRegistration) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/mobile/push-device"))
        request.httpMethod = method
        request.httpBody = try FoodTrackerCoding.encoder.encode(registration)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(origin, forHTTPHeaderField: "Origin")

        let (_, response) = try await session.data(for: request)
        guard let HTTPResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        if HTTPResponse.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(HTTPResponse.statusCode) else {
            throw APIError.server("The notification setting could not be saved.")
        }
    }

    private var origin: String {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.path = ""
        components?.query = nil
        components?.fragment = nil
        return components?.url?.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            ?? baseURL.absoluteString
    }
}

func hexadecimalDeviceToken(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
}
