import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { describe, it } from "node:test";

import { createApnsPushProvider } from "./apns";
import { isPushProviderError } from "./push-provider";

const cryptoProvider = webcrypto as unknown as Crypto;

describe("createApnsPushProvider", () => {
  it("signs an ES256 provider token and sends a bounded alert payload", async () => {
    const keyPair = await createKeyPair();
    let capturedAuthorization = "";
    let capturedPayload: Record<string, unknown> = {};
    let capturedHeaders = new Headers();
    let capturedUrl = "";
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      capturedHeaders = new Headers(init?.headers);
      capturedPayload = JSON.parse(
        new TextDecoder().decode(init?.body as Uint8Array),
      );
      return new Response(null, {
        headers: { "apns-id": "apns-response-id" },
        status: 200,
      });
    };
    const provider = createApnsPushProvider({
      bundleId: "com.wodsmith.listtoladle",
      createId: () => "22222222-2222-4222-8222-222222222222",
      cryptoProvider,
      environment: "sandbox",
      fetcher,
      keyId: "KEY1234567",
      now: () => new Date("2026-07-21T12:00:00.000Z"),
      privateKey: keyPair.privateKeyPem,
      teamId: "TEAM123456",
    });

    const result = await provider.send({
      alert: { body: "Your new meal plan is ready.", title: "List To Ladle" },
      deliveryId: "delivery-123",
      destination: "/schedule/week-123",
      deviceToken: "ab".repeat(32),
    });

    assert.equal(capturedUrl, `https://api.sandbox.push.apple.com/3/device/${"ab".repeat(32)}`);
    assert.equal(result.providerMessageId, "apns-response-id");
    assert.equal(capturedHeaders.get("apns-id"), "22222222-2222-4222-8222-222222222222");
    assert.deepEqual(capturedPayload, {
      aps: {
        alert: { body: "Your new meal plan is ready.", title: "List To Ladle" },
        sound: "default",
      },
      deliveryId: "delivery-123",
      destination: "/schedule/week-123",
    });

    const token = capturedAuthorization.replace(/^bearer /, "");
    const [header, claims, signature] = token.split(".");
    assert.deepEqual(decodePart(header), { alg: "ES256", kid: "KEY1234567" });
    assert.deepEqual(decodePart(claims), { iat: 1784635200, iss: "TEAM123456" });
    assert.equal(
      await cryptoProvider.subtle.verify(
        { hash: "SHA-256", name: "ECDSA" },
        keyPair.publicKey,
        decodeBase64Url(signature),
        new TextEncoder().encode(`${header}.${claims}`),
      ),
      true,
    );
  });

  it("classifies an unregistered device token as permanent and invalid", async () => {
    const keyPair = await createKeyPair();
    let capturedUrl = "";
    const provider = createApnsPushProvider({
      bundleId: "com.wodsmith.listtoladle",
      cryptoProvider,
      environment: "production",
      fetcher: async (input) => {
        capturedUrl = String(input);
        return Response.json({ reason: "Unregistered" }, { status: 410 });
      },
      keyId: "KEY1234567",
      privateKey: keyPair.privateKeyPem,
      teamId: "TEAM123456",
    });

    await assert.rejects(
      provider.send({
        alert: { body: "Body", title: "Title" },
        deliveryId: "delivery-123",
        deviceToken: "cd".repeat(32),
      }),
      (error: unknown) => {
        assert.equal(isPushProviderError(error), true);
        if (!isPushProviderError(error)) return false;
        assert.equal(error.invalidateDeviceToken, true);
        assert.equal(error.retryable, false);
        assert.equal(error.status, 410);
        return true;
      },
    );
    assert.equal(capturedUrl, `https://api.push.apple.com/3/device/${"cd".repeat(32)}`);
  });

  it("rejects an oversized payload before contacting APNs", async () => {
    const keyPair = await createKeyPair();
    let fetchCalls = 0;
    const provider = createApnsPushProvider({
      bundleId: "com.wodsmith.listtoladle",
      cryptoProvider,
      environment: "sandbox",
      fetcher: async () => {
        fetchCalls += 1;
        return new Response(null, { status: 200 });
      },
      keyId: "KEY1234567",
      privateKey: keyPair.privateKeyPem,
      teamId: "TEAM123456",
    });

    await assert.rejects(
      provider.send({
        alert: { body: "x".repeat(4_096), title: "Title" },
        deliveryId: "delivery-123",
        deviceToken: "ef".repeat(32),
      }),
      /payload exceeds 4096 bytes/,
    );
    assert.equal(fetchCalls, 0);
  });
});

async function createKeyPair() {
  const keyPair = (await cryptoProvider.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const privateKey = (await cryptoProvider.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  )) as ArrayBuffer;
  const encoded = Buffer.from(new Uint8Array(privateKey))
    .toString("base64")
    .match(/.{1,64}/g)?.join("\n") ?? "";

  return {
    privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`,
    publicKey: keyPair.publicKey,
  };
}

function decodePart(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(Buffer.from(normalized, "base64"));
}
