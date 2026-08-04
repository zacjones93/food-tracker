import assert from "node:assert/strict";
import test from "node:test";
import { Environment, Status } from "@apple/app-store-server-library";
import {
  createAppleSubscriptionState,
  getAppleStatus,
  isAppleSubscriptionAccessActive,
  parseAppleProductIds,
  shouldApplyAppleSubscriptionUpdate,
} from "./apple-subscription-state";

test("product identifiers are configured, trimmed, and deduplicated", () => {
  assert.deepEqual(
    parseAppleProductIds(" pro.monthly,pro.annual, pro.monthly "),
    ["pro.monthly", "pro.annual"],
  );
  assert.deepEqual(parseAppleProductIds(undefined), []);
});

test("Apple status grants access only while active or in billing grace", () => {
  assert.equal(getAppleStatus({ status: Status.ACTIVE }), "active");
  assert.equal(getAppleStatus({ status: Status.BILLING_GRACE_PERIOD }), "grace_period");
  assert.equal(getAppleStatus({ status: Status.BILLING_RETRY }), "billing_retry");
  assert.equal(getAppleStatus({ status: Status.EXPIRED }), "expired");
  assert.equal(getAppleStatus({ status: Status.REVOKED }), "revoked");
  const now = new Date("2026-07-22T12:00:00.000Z");
  const future = new Date("2026-07-23T12:00:00.000Z");
  assert.equal(isAppleSubscriptionAccessActive({
    currentPeriodEnd: future,
    gracePeriodExpiresAt: null,
    now,
    status: "active",
  }), true);
  assert.equal(isAppleSubscriptionAccessActive({
    currentPeriodEnd: null,
    gracePeriodExpiresAt: future,
    now,
    status: "grace_period",
  }), true);
  assert.equal(isAppleSubscriptionAccessActive({
    currentPeriodEnd: future,
    gracePeriodExpiresAt: null,
    now,
    status: "billing_retry",
  }), false);
});

test("verified transaction data becomes a normalized entitlement state", () => {
  const state = createAppleSubscriptionState({
    now: new Date("2026-07-22T12:00:00.000Z"),
    status: Status.ACTIVE,
    transaction: {
      appAccountToken: "8ac1b29d-b30e-4350-9945-f2a4acbddf78",
      bundleId: "com.example.food",
      environment: Environment.SANDBOX,
      expiresDate: Date.parse("2026-08-22T12:00:00.000Z"),
      originalTransactionId: "200000000000001",
      productId: "pro.monthly",
      purchaseDate: Date.parse("2026-07-22T12:00:00.000Z"),
      signedDate: Date.parse("2026-07-22T12:00:01.000Z"),
      transactionId: "200000000000002",
    },
  });

  assert.equal(state.status, "active");
  assert.equal(state.hasAccess, true);
  assert.equal(state.productId, "pro.monthly");
  assert.equal(state.currentPeriodEnd?.toISOString(), "2026-08-22T12:00:00.000Z");
});

test("revocation wins over an active server status", () => {
  assert.equal(getAppleStatus({
    revocationDate: Date.parse("2026-07-22T12:00:00.000Z"),
    status: Status.ACTIVE,
  }), "revoked");
});

test("signed timestamps make Apple state updates monotonic and idempotent", () => {
  const transactionTime = new Date("2026-07-22T12:00:00.000Z");
  const renewalTime = new Date("2026-07-22T13:00:00.000Z");
  assert.equal(shouldApplyAppleSubscriptionUpdate({
    currentRenewalSignedAt: renewalTime,
    currentTransactionSignedAt: transactionTime,
    nextRenewalSignedAt: new Date("2026-07-22T12:30:00.000Z"),
    nextTransactionSignedAt: transactionTime,
  }), false);
  assert.equal(shouldApplyAppleSubscriptionUpdate({
    currentRenewalSignedAt: renewalTime,
    currentTransactionSignedAt: transactionTime,
    nextRenewalSignedAt: new Date("2026-07-22T14:00:00.000Z"),
    nextTransactionSignedAt: transactionTime,
  }), true);
  assert.equal(shouldApplyAppleSubscriptionUpdate({
    currentRenewalSignedAt: renewalTime,
    currentTransactionSignedAt: transactionTime,
    nextRenewalSignedAt: null,
    nextTransactionSignedAt: new Date("2026-07-22T11:00:00.000Z"),
  }), false);
});
