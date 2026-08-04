import Foundation
import Observation
import StoreKit

struct AppleSubscriptionConfiguration: Decodable, Hashable, Sendable {
    var appAccountToken: UUID
    var productIds: [String]
}

private struct AppleSubscriptionSyncRequest: Encodable {
    var signedTransaction: String
}

private struct AppleSubscriptionSyncResponse: Decodable {
    var hasAccess: Bool
    var status: String
}

protocol AppleSubscriptionServerAPI: Sendable {
    func loadConfiguration() async throws -> AppleSubscriptionConfiguration
    func synchronize(signedTransaction: String) async throws
}

struct AppleSubscriptionServerClient: AppleSubscriptionServerAPI {
    let baseURL: URL
    let session: URLSession

    init(
        baseURL: URL = FoodTrackerAPIClient.defaultBaseURL,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
    }

    func loadConfiguration() async throws -> AppleSubscriptionConfiguration {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/mobile/apple/subscriptions/configuration")
        )
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await perform(request)
    }

    func synchronize(signedTransaction: String) async throws {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/mobile/apple/subscriptions/sync")
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.httpBody = try FoodTrackerCoding.encoder.encode(
            AppleSubscriptionSyncRequest(signedTransaction: signedTransaction)
        )
        let _: AppleSubscriptionSyncResponse = try await perform(request)
    }

    private var origin: String {
        var components = URLComponents()
        components.scheme = baseURL.scheme
        components.host = baseURL.host
        components.port = baseURL.port
        return components.string ?? baseURL.absoluteString
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let HTTPResponse = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if HTTPResponse.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(HTTPResponse.statusCode) else {
            let error = try? FoodTrackerCoding.decoder.decode(AppleSubscriptionServerError.self, from: data)
            throw APIError.server(error?.error ?? "The App Store subscription could not be updated.")
        }
        return try FoodTrackerCoding.decoder.decode(Response.self, from: data)
    }
}

private struct AppleSubscriptionServerError: Decodable {
    var error: String
}

@MainActor
@Observable
final class SubscriptionStore {
    private(set) var configuration: AppleSubscriptionConfiguration?
    private(set) var products: [Product] = []
    private(set) var isLoading = false
    private(set) var isPurchasing = false
    private(set) var isRestoring = false
    private(set) var errorMessage: String?
    private(set) var entitlementRevision = 0
    @ObservationIgnored private var activeTeamID: String?
    @ObservationIgnored private var server: (any AppleSubscriptionServerAPI)?
    @ObservationIgnored private var transactionUpdates: Task<Void, Never>?

    deinit { transactionUpdates?.cancel() }

    func activate(
        teamID: String,
        server: any AppleSubscriptionServerAPI = AppleSubscriptionServerClient()
    ) async {
        guard activeTeamID != teamID else { return }
        deactivate()
        activeTeamID = teamID
        self.server = server
        isLoading = true
        errorMessage = nil
        startTransactionListener()
        defer { isLoading = false }

        do {
            let configuration = try await server.loadConfiguration()
            guard !configuration.productIds.isEmpty else {
                throw APIError.server("No App Store subscription products are configured.")
            }
            self.configuration = configuration
            products = try await Product.products(for: configuration.productIds)
                .sorted { $0.price < $1.price }
            if products.isEmpty {
                errorMessage = "Subscriptions are temporarily unavailable in this App Store storefront."
            }
            await synchronizeCurrentEntitlements()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deactivate() {
        transactionUpdates?.cancel()
        transactionUpdates = nil
        activeTeamID = nil
        server = nil
        configuration = nil
        products = []
        errorMessage = nil
        isLoading = false
        isPurchasing = false
        isRestoring = false
    }

    func purchase(_ product: Product) async -> Bool {
        guard let configuration, let server else {
            errorMessage = "Subscription setup is not ready."
            return false
        }
        guard AppStore.canMakePayments else {
            errorMessage = "Purchases are not allowed on this device."
            return false
        }

        isPurchasing = true
        errorMessage = nil
        defer { isPurchasing = false }
        do {
            let result = try await product.purchase(options: [
                .appAccountToken(configuration.appAccountToken),
            ])
            switch result {
            case .success(let verification):
                let transaction = try verifiedTransaction(from: verification)
                try await server.synchronize(signedTransaction: verification.jwsRepresentation)
                await transaction.finish()
                entitlementRevision += 1
                return true
            case .pending:
                errorMessage = "This purchase is awaiting approval."
            case .userCancelled:
                break
            @unknown default:
                errorMessage = "The App Store returned an unknown purchase result."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        return false
    }

    func restorePurchases() async -> Bool {
        guard server != nil else {
            errorMessage = "Subscription setup is not ready."
            return false
        }
        isRestoring = true
        errorMessage = nil
        defer { isRestoring = false }
        do {
            try await AppStore.sync()
            let synchronized = await synchronizeCurrentEntitlements()
            if !synchronized {
                errorMessage = "No restorable List To Ladle subscription was found for this Apple Account."
            }
            return synchronized
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func clearError() { errorMessage = nil }

    private func startTransactionListener() {
        transactionUpdates = Task { [weak self] in
            for await verification in Transaction.updates {
                guard let self, !Task.isCancelled else { return }
                await self.processTransactionUpdate(verification)
            }
        }
    }

    private func processTransactionUpdate(_ verification: VerificationResult<Transaction>) async {
        guard let server else { return }
        do {
            let transaction = try verifiedTransaction(from: verification)
            guard configuration?.productIds.contains(transaction.productID) == true else { return }
            try await server.synchronize(signedTransaction: verification.jwsRepresentation)
            await transaction.finish()
            entitlementRevision += 1
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    private func synchronizeCurrentEntitlements() async -> Bool {
        guard let configuration, let server else { return false }
        var didSynchronize = false
        for await verification in Transaction.currentEntitlements {
            do {
                let transaction = try verifiedTransaction(from: verification)
                guard configuration.productIds.contains(transaction.productID) else { continue }
                try await server.synchronize(signedTransaction: verification.jwsRepresentation)
                await transaction.finish()
                didSynchronize = true
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        if didSynchronize { entitlementRevision += 1 }
        return didSynchronize
    }

    private func verifiedTransaction(
        from verification: VerificationResult<Transaction>
    ) throws -> Transaction {
        switch verification {
        case .verified(let transaction):
            return transaction
        case .unverified(_, let error):
            throw error
        }
    }
}

func subscriptionPeriodLabel(
    value: Int,
    unit periodUnit: Product.SubscriptionPeriod.Unit
) -> String {
    let unit: String
    switch periodUnit {
    case .day: unit = value == 1 ? "day" : "days"
    case .week: unit = value == 1 ? "week" : "weeks"
    case .month: unit = value == 1 ? "month" : "months"
    case .year: unit = value == 1 ? "year" : "years"
    @unknown default: unit = "period"
    }
    return value == 1 ? unit : "\(value) \(unit)"
}
