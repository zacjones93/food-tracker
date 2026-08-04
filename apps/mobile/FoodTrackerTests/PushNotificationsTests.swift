import Foundation
@testable import FoodTracker
import XCTest

final class PushNotificationsTests: XCTestCase {
    func testDeviceTokenUsesLowercaseHexWithoutAssumingTokenLength() {
        XCTAssertEqual(
            hexadecimalDeviceToken(Data([0x00, 0x0f, 0xa1, 0xff, 0x42])),
            "000fa1ff42"
        )
    }

    func testRegistrationUsesAuthenticatedSameOriginMobileEndpoint() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PushURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let client = PushDeviceAPIClient(
            baseURL: URL(string: "https://food.example.test")!,
            session: session
        )

        PushURLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/mobile/push-device")
            XCTAssertEqual(request.httpMethod, "PUT")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://food.example.test")
            let body = try request.bodyData()
            let registration = try FoodTrackerCoding.decoder.decode(
                PushDeviceRegistration.self,
                from: body
            )
            XCTAssertEqual(registration.token, "ab12")
            XCTAssertEqual(registration.installationId, "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e")
            return HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
        }

        try await client.register(
            registration: PushDeviceRegistration(
                bundleId: PushDeviceRegistration.bundleId,
                environment: "sandbox",
                installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
                token: "ab12"
            )
        )
    }
}

private final class PushURLProtocolStub: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> HTTPURLResponse)?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let handler = try XCTUnwrap(Self.handler)
            let response = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private extension URLRequest {
    func bodyData() throws -> Data {
        if let httpBody { return httpBody }
        let stream = try XCTUnwrap(httpBodyStream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let count = stream.read(buffer, maxLength: 4_096)
            if count < 0 { throw try XCTUnwrap(stream.streamError) }
            if count == 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
