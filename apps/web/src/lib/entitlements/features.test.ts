import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_PLAN,
  getWeeksRemaining,
  isSubscriptionAccessActive,
} from "./features";

test("the free plan allows exactly four lifetime week creations", () => {
  assert.equal(FREE_PLAN.features.weekCreationLimit, 4);
  assert.equal(getWeeksRemaining({ usageCount: 0, weekCreationLimit: 4 }), 4);
  assert.equal(getWeeksRemaining({ usageCount: 4, weekCreationLimit: 4 }), 0);
  assert.equal(getWeeksRemaining({ usageCount: 9, weekCreationLimit: 4 }), 0);
});

test("an unlimited snapshot has no remaining-week counter", () => {
  assert.equal(getWeeksRemaining({ usageCount: 100, weekCreationLimit: null }), null);
});

test("subscription access includes only active and trialing states", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  assert.equal(isSubscriptionAccessActive({ status: "active", currentPeriodEnd: null, now }), true);
  assert.equal(isSubscriptionAccessActive({ status: "trialing", currentPeriodEnd: null, now }), true);
  assert.equal(isSubscriptionAccessActive({
    status: "past_due",
    currentPeriodEnd: new Date("2026-07-22T12:00:00.000Z"),
    now,
  }), false);
  assert.equal(isSubscriptionAccessActive({ status: "canceled", currentPeriodEnd: null, now }), false);
});
