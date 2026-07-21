import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTelnyxEventEnvelope, verifyTelnyxWebhook } from "./telnyx-webhook";

describe("Telnyx webhook verification", () => {
  it("verifies an Ed25519 signature over the exact raw payload", async () => {
    const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    if (!("privateKey" in keys)) throw new Error("Expected an Ed25519 key pair");

    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ data: { event_type: "message.finalized", id: "event-123", payload: {} } });
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, signedPayload);
    const publicKey = await crypto.subtle.exportKey("raw", keys.publicKey);
    if (!(publicKey instanceof ArrayBuffer)) throw new Error("Expected a raw Ed25519 public key");

    assert.equal(
      await verifyTelnyxWebhook({
        publicKey: Buffer.from(publicKey).toString("base64"),
        rawBody,
        signature: Buffer.from(signature).toString("base64"),
        timestamp,
      }),
      true,
    );
  });

  it("rejects stale signatures", async () => {
    assert.equal(
      await verifyTelnyxWebhook({
        nowMs: 1_000_000,
        publicKey: "invalid",
        rawBody: "{}",
        signature: "invalid",
        timestamp: "1",
      }),
      false,
    );
  });

  it("parses only the event metadata needed for idempotency and routing", () => {
    assert.deepEqual(
      parseTelnyxEventEnvelope(
        JSON.stringify({
          data: {
            event_type: "message.received",
            id: "event-123",
            occurred_at: "2026-07-21T12:00:00.000Z",
            payload: { text: "STOP" },
          },
        }),
      ),
      {
        data: {
          event_type: "message.received",
          id: "event-123",
          occurred_at: "2026-07-21T12:00:00.000Z",
          payload: { text: "STOP" },
        },
      },
    );
    assert.equal(parseTelnyxEventEnvelope("{}"), null);
  });
});
