import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processPushDelivery,
  type DeliveryRepository,
  type PushDelivery,
} from "./delivery";
import type { PushProvider, SendPushInput } from "./push-provider";

const BUNDLE_ID = "com.wodsmith.listtoladle";
const DEVICE_TOKEN = "ab".repeat(32);
const NOW = new Date("2026-07-22T12:00:00.000Z");

describe("processPushDelivery", () => {
  it("suppresses a delivery when current membership is inactive", async () => {
    const state = createFakeState({ membershipActive: false });
    const sent: SendPushInput[] = [];

    const result = await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider: createProvider(sent),
      repository: state.repository,
    });

    assert.equal(result, "complete");
    assert.equal(state.delivery.status, "suppressed");
    assert.equal(state.suppressionReason, "membership_inactive");
    assert.equal(sent.length, 0);
  });

  it("suppresses a delivery when the current team preference is disabled", async () => {
    const state = createFakeState({ preferenceEnabled: false });
    const sent: SendPushInput[] = [];

    await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider: createProvider(sent),
      repository: state.repository,
    });

    assert.equal(state.delivery.status, "suppressed");
    assert.equal(state.suppressionReason, "preference_disabled");
    assert.equal(sent.length, 0);
  });

  it("never crosses the configured APNs environment", async () => {
    const state = createFakeState({ deviceEnvironment: "production" });
    const sent: SendPushInput[] = [];

    await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider: createProvider(sent),
      repository: state.repository,
    });

    assert.equal(state.delivery.status, "suppressed");
    assert.equal(state.suppressionReason, "environment_mismatch");
    assert.equal(sent.length, 0);
  });

  it("claims, sends, and records APNs acceptance once", async () => {
    const state = createFakeState();
    const sent: SendPushInput[] = [];
    const provider = createProvider(sent);

    const firstResult = await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider,
      repository: state.repository,
    });
    const duplicateResult = await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider,
      repository: state.repository,
    });

    assert.equal(firstResult, "complete");
    assert.equal(duplicateResult, "complete");
    assert.equal(state.delivery.status, "accepted");
    assert.equal(state.providerMessageId, "provider-message-id");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.apnsId, state.delivery.apnsId);
  });

  it("retries without sending while another consumer holds the lease", async () => {
    const state = createFakeState({
      leaseExpiresAt: Math.floor(NOW.getTime() / 1_000) + 30,
      status: "sending",
    });
    const sent: SendPushInput[] = [];

    const result = await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider: createProvider(sent),
      repository: state.repository,
    });

    assert.equal(result, "retry");
    assert.equal(sent.length, 0);
  });

  it("disables only the rejected token after an invalid-token response", async () => {
    const state = createFakeState();
    const invalidTokenError = Object.assign(new Error("Unregistered"), {
      invalidateDeviceToken: true,
      name: "PushProviderError",
      providerCode: "Unregistered",
      retryable: false,
      status: 410,
    });

    const result = await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "production",
      now: () => NOW,
      provider: { send: async () => Promise.reject(invalidTokenError) },
      repository: createFakeState({ deviceEnvironment: "production" }, state).repository,
    });

    assert.equal(result, "complete");
    assert.equal(state.delivery.status, "failed");
    assert.deepEqual(state.disabledDevice, {
      deviceId: state.delivery.deviceId,
      deviceToken: DEVICE_TOKEN,
    });
  });

  it("persists retryable state before asking the queue to retry", async () => {
    const state = createFakeState();
    const retryableError = Object.assign(new Error("ServiceUnavailable"), {
      invalidateDeviceToken: false,
      name: "PushProviderError",
      providerCode: "ServiceUnavailable",
      retryable: true,
      status: 503,
    });

    const result = await processPushDelivery({
      bundleId: BUNDLE_ID,
      deliveryId: state.delivery.id,
      environment: "sandbox",
      now: () => NOW,
      provider: { send: async () => Promise.reject(retryableError) },
      repository: state.repository,
    });

    assert.equal(result, "retry");
    assert.equal(state.delivery.status, "retryable");
    assert.equal(state.providerCode, "ServiceUnavailable");
  });
});

interface FakeState {
  delivery: PushDelivery;
  disabledDevice?: { deviceId: string; deviceToken: string };
  providerCode?: string;
  providerMessageId?: string;
  repository: DeliveryRepository;
  suppressionReason?: string;
}

function createFakeState(
  overrides: Partial<PushDelivery> = {},
  existingState?: FakeState,
): FakeState {
  const state = existingState ?? ({} as FakeState);
  const previousDelivery: Partial<PushDelivery> = existingState?.delivery ?? {};
  state.delivery = {
    apnsId: "11111111-1111-4111-8111-111111111111",
    body: "Your meal plan is ready.",
    destination: "/schedule/week-123",
    deviceBundleId: BUNDLE_ID,
    deviceEnabled: true,
    deviceEnvironment: "sandbox",
    deviceId: "push-device-123",
    deviceToken: DEVICE_TOKEN,
    id: "push-delivery-123",
    membershipActive: true,
    preferenceEnabled: true,
    status: "pending",
    title: "List To Ladle",
    ...previousDelivery,
    ...overrides,
  };
  state.repository = {
    async claim({ leaseExpiresAt, now }) {
      const canClaim =
        state.delivery.status === "pending" ||
        state.delivery.status === "retryable" ||
        (state.delivery.status === "sending" &&
          (state.delivery.leaseExpiresAt ?? Number.POSITIVE_INFINITY) <= now);
      if (!canClaim) return false;
      state.delivery.status = "sending";
      state.delivery.leaseExpiresAt = leaseExpiresAt;
      return true;
    },
    async disableInvalidDevice({ deviceId, deviceToken }) {
      state.disabledDevice = { deviceId, deviceToken };
      if (state.delivery.deviceToken === deviceToken) state.delivery.deviceEnabled = false;
    },
    async find(deliveryId) {
      return deliveryId === state.delivery.id ? { ...state.delivery } : undefined;
    },
    async markAccepted({ providerMessageId }) {
      state.delivery.status = "accepted";
      state.providerMessageId = providerMessageId;
    },
    async markFailed({ providerCode }) {
      state.delivery.status = "failed";
      state.providerCode = providerCode;
    },
    async markRetryable({ providerCode }) {
      state.delivery.status = "retryable";
      state.providerCode = providerCode;
    },
    async markSuppressed({ reason }) {
      state.delivery.status = "suppressed";
      state.suppressionReason = reason;
    },
  };
  return state;
}

function createProvider(sent: SendPushInput[]): PushProvider {
  return {
    async send(input) {
      sent.push(input);
      return { acceptedAt: NOW, providerMessageId: "provider-message-id" };
    },
  };
}
