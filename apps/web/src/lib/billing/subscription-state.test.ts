import assert from "node:assert/strict";
import test from "node:test";
import { selectRecognizedSubscriptionId } from "./subscription-state";

test("selects an active recognized offer over newer incomplete or unrelated subscriptions", () => {
  const selected = selectRecognizedSubscriptionId({
    currentPriceId: "price_pro",
    grandfatheredSubscriptionIds: new Set(),
    subscriptions: [
      { id: "sub_unrelated", priceIds: ["price_other"], status: "active" },
      { id: "sub_incomplete", priceIds: ["price_pro"], status: "incomplete" },
      { id: "sub_active", priceIds: ["price_pro"], status: "active" },
    ],
  });

  assert.equal(selected, "sub_active");
});

test("continues recognizing a grandfathered subscription after the current price changes", () => {
  const selected = selectRecognizedSubscriptionId({
    currentPriceId: "price_v2",
    grandfatheredSubscriptionIds: new Set(["sub_v1"]),
    subscriptions: [
      { id: "sub_v1", priceIds: ["price_v1"], status: "active" },
    ],
  });

  assert.equal(selected, "sub_v1");
});

test("does not recognize an unrelated active subscription", () => {
  const selected = selectRecognizedSubscriptionId({
    currentPriceId: "price_pro",
    grandfatheredSubscriptionIds: new Set(),
    subscriptions: [
      { id: "sub_other", priceIds: ["price_other"], status: "active" },
    ],
  });

  assert.equal(selected, null);
});
