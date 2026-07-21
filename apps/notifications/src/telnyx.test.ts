import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSmsProviderError } from "./sms-provider";
import { createTelnyxSmsProvider } from "./telnyx";

describe("createTelnyxSmsProvider", () => {
  it("sends a GSM-efficient SMS without exposing the API key in the payload", async () => {
    let capturedAuthorization = "";
    let capturedPayload: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (_input, init) => {
      capturedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
      capturedPayload = JSON.parse(String(init?.body));

      return Response.json({
        data: {
          encoding: "GSM-7",
          id: "message-123",
          parts: 1,
          received_at: "2026-07-21T12:00:00.000Z",
        },
      });
    };
    const provider = createTelnyxSmsProvider({
      apiKey: "test-api-key",
      fetcher,
      fromE164: "+12082180252",
      messagingProfileId: "profile-123",
    });

    const result = await provider.send({
      body: "Tonight: Rigatoni. Reply STOP to opt out.",
      deliveryId: "delivery-123",
      statusCallbackUrl: "https://notifications.listtoladle.com/webhooks/telnyx",
      toE164: "+12085550123",
    });

    assert.equal(capturedAuthorization, "Bearer test-api-key");
    assert.equal(JSON.stringify(capturedPayload).includes("test-api-key"), false);
    assert.deepEqual(capturedPayload, {
      auto_detect: true,
      encoding: "auto",
      from: "+12082180252",
      messaging_profile_id: "profile-123",
      text: "Tonight: Rigatoni. Reply STOP to opt out.",
      to: "+12085550123",
      type: "SMS",
      use_profile_webhooks: false,
      webhook_url: "https://notifications.listtoladle.com/webhooks/telnyx",
    });
    assert.equal(result.providerMessageId, "message-123");
    assert.equal(result.encoding, "GSM-7");
    assert.equal(result.parts, 1);
  });

  it("rejects localhost and non-HTTPS callback URLs", async () => {
    const provider = createTelnyxSmsProvider({
      apiKey: "test-api-key",
      fetcher: async () => Response.json({ data: { id: "not-used" } }),
      fromE164: "+12082180252",
      messagingProfileId: "profile-123",
    });

    await assert.rejects(
      provider.send({
        body: "Test",
        deliveryId: "delivery-123",
        statusCallbackUrl: "http://localhost:8787/webhooks/telnyx",
        toE164: "+12085550123",
      }),
      /public HTTPS URL/,
    );
  });

  it("classifies rate limits and server errors as retryable", async () => {
    const provider = createTelnyxSmsProvider({
      apiKey: "test-api-key",
      fetcher: async () =>
        Response.json(
          { errors: [{ code: "40333", detail: "Messaging profile spend limit reached" }] },
          { status: 429 },
        ),
      fromE164: "+12082180252",
      messagingProfileId: "profile-123",
    });

    await assert.rejects(
      provider.send({ body: "Test", deliveryId: "delivery-123", toE164: "+12085550123" }),
      (error: unknown) => {
        assert.equal(isSmsProviderError(error), true);
        if (!isSmsProviderError(error)) return false;
        assert.equal(error.providerCode, "40333");
        assert.equal(error.retryable, true);
        assert.equal(error.status, 429);
        return true;
      },
    );
  });

  it("classifies validation failures as permanent", async () => {
    const provider = createTelnyxSmsProvider({
      apiKey: "test-api-key",
      fetcher: async () =>
        Response.json({ errors: [{ code: "40010", detail: "Not 10DLC registered" }] }, { status: 400 }),
      fromE164: "+12082180252",
      messagingProfileId: "profile-123",
    });

    await assert.rejects(
      provider.send({ body: "Test", deliveryId: "delivery-123", toE164: "+12085550123" }),
      (error: unknown) => isSmsProviderError(error) && !error.retryable && error.providerCode === "40010",
    );
  });
});
