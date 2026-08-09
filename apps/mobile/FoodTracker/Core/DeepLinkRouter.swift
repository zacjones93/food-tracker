import Foundation
import Observation

@MainActor
@Observable
final class DeepLinkRouter {
    enum Destination: Equatable {
        case recipeServerID(String, edit: Bool)
        case recipeDialID(String, edit: Bool)
    }

    private(set) var pendingDestination: Destination?
    private(set) var pendingURL: URL?

    func handle(_ url: URL) {
        guard url.scheme == "https", url.host == "listtoladle.com" else { return }
        pendingURL = url
        let components = url.pathComponents.filter { $0 != "/" }
        if components.count >= 4,
           components[0] == "integrations",
           components[1] == "dial",
           components[2] == "recipes" {
            pendingDestination = .recipeDialID(
                components[3].removingPercentEncoding ?? components[3],
                edit: components.dropFirst(4).first == "edit"
            )
        } else if components.count >= 2, components[0] == "recipes" {
            pendingDestination = .recipeServerID(
                components[1].removingPercentEncoding ?? components[1],
                edit: false
            )
        }
    }

    func consume() {
        pendingDestination = nil
        pendingURL = nil
    }
}
