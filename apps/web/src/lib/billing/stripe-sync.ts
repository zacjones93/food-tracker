import "server-only";

import { getDB } from "@/db";
import {
  teamEntitlementSnapshotsTable,
  teamSubscriptionsTable,
  teamTable,
} from "@/db/schema";
import { selectRecognizedSubscriptionId } from "@/lib/billing/subscription-state";
import {
  CURRENT_PAID_PLAN,
  isSubscriptionAccessActive,
} from "@/lib/entitlements/features";
import { getStripe } from "@/lib/stripe";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

function fromStripeTimestamp(value: number | null | undefined): Date | null {
  return value ? new Date(value * 1_000) : null;
}

function getPaymentMethod(
  paymentMethod: string | Stripe.PaymentMethod | null,
): { brand: string | null; last4: string | null } | null {
  if (!paymentMethod || typeof paymentMethod === "string") return null;

  return {
    brand: paymentMethod.card?.brand ?? null,
    last4: paymentMethod.card?.last4 ?? null,
  };
}

async function getOrCreateEntitlementSnapshot({
  subscriptionId,
  teamId,
}: {
  subscriptionId: string;
  teamId: string;
}) {
  const db = getDB();
  const existing = await db.query.teamEntitlementSnapshotsTable.findFirst({
    where: and(
      eq(teamEntitlementSnapshotsTable.source, "stripe_subscription"),
      eq(teamEntitlementSnapshotsTable.sourceId, subscriptionId),
    ),
  });
  if (existing) {
    if (existing.teamId !== teamId) {
      throw new Error("Stripe subscription is already bound to another team");
    }
    return existing;
  }

  await db.insert(teamEntitlementSnapshotsTable).values({
    teamId,
    source: "stripe_subscription",
    sourceId: subscriptionId,
    planKey: CURRENT_PAID_PLAN.key,
    planVersion: CURRENT_PAID_PLAN.version,
    features: { ...CURRENT_PAID_PLAN.features },
  }).onConflictDoNothing({
    target: [
      teamEntitlementSnapshotsTable.source,
      teamEntitlementSnapshotsTable.sourceId,
    ],
  });

  const created = await db.query.teamEntitlementSnapshotsTable.findFirst({
    where: and(
      eq(teamEntitlementSnapshotsTable.source, "stripe_subscription"),
      eq(teamEntitlementSnapshotsTable.sourceId, subscriptionId),
    ),
  });
  if (!created || created.teamId !== teamId) {
    throw new Error("Unable to create the team entitlement snapshot");
  }
  return created;
}

export async function getOrCreateStripeCustomer({
  email,
  teamId,
}: {
  email: string;
  teamId: string;
}): Promise<string> {
  const db = getDB();
  const existing = await db.query.teamSubscriptionsTable.findFirst({
    where: eq(teamSubscriptionsTable.teamId, teamId),
  });
  if (existing) return existing.stripeCustomerId;

  const team = await db.query.teamTable.findFirst({
    where: eq(teamTable.id, teamId),
  });
  if (!team) throw new Error("Team not found");

  const customer = await getStripe().customers.create({
    email,
    name: team.name,
    metadata: { teamId },
  }, {
    idempotencyKey: `list-to-ladle:team-customer:${teamId}`,
  });

  await db.insert(teamSubscriptionsTable).values({
    teamId,
    stripeCustomerId: customer.id,
    status: "none",
  }).onConflictDoNothing({ target: teamSubscriptionsTable.teamId });

  const binding = await db.query.teamSubscriptionsTable.findFirst({
    where: eq(teamSubscriptionsTable.teamId, teamId),
  });
  if (!binding) throw new Error("Unable to bind the Stripe customer to the team");
  return binding.stripeCustomerId;
}

// This is the single Stripe-to-application synchronization path. Webhooks and
// the post-Checkout success route both call it, so event ordering cannot apply
// partial subscription state to the application.
export async function syncStripeDataForCustomer({
  customerId,
}: {
  customerId: string;
}) {
  const db = getDB();
  const binding = await db.query.teamSubscriptionsTable.findFirst({
    where: eq(teamSubscriptionsTable.stripeCustomerId, customerId),
  });
  if (!binding) return { status: "unbound" as const, hasAccess: false };

  const currentPriceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!currentPriceId) throw new Error("STRIPE_PRO_PRICE_ID is not configured");

  const snapshots = await db.query.teamEntitlementSnapshotsTable.findMany({
    where: and(
      eq(teamEntitlementSnapshotsTable.teamId, binding.teamId),
      eq(teamEntitlementSnapshotsTable.source, "stripe_subscription"),
    ),
  });

  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    limit: 100,
    status: "all",
    expand: ["data.default_payment_method"],
  });
  const selectedSubscriptionId = selectRecognizedSubscriptionId({
    currentPriceId,
    grandfatheredSubscriptionIds: new Set(snapshots.map((snapshot) => snapshot.sourceId)),
    subscriptions: subscriptions.data.map((subscription) => ({
      id: subscription.id,
      priceIds: subscription.items.data.map((item) => item.price.id),
      status: subscription.status,
    })),
  });
  const subscription = subscriptions.data.find(({ id }) => id === selectedSubscriptionId);
  const now = new Date();

  if (!subscription) {
    await db.update(teamSubscriptionsTable).set({
      status: "none",
      stripeSubscriptionId: null,
      entitlementSnapshotId: null,
      priceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      paymentMethod: null,
      lastSyncedAt: now,
    }).where(eq(teamSubscriptionsTable.id, binding.id));
    return { status: "none" as const, hasAccess: false };
  }

  const existingSnapshot = snapshots.find(({ sourceId }) => sourceId === subscription.id);
  const item = subscription.items.data.find(({ price }) => price.id === currentPriceId)
    ?? subscription.items.data[0];
  if (!item) throw new Error(`Stripe subscription ${subscription.id} has no items`);
  const hasAccess = isSubscriptionAccessActive({
    currentPeriodEnd: fromStripeTimestamp(item.current_period_end),
    status: subscription.status,
  });
  const snapshot = existingSnapshot ?? (hasAccess
    ? await getOrCreateEntitlementSnapshot({
        subscriptionId: subscription.id,
        teamId: binding.teamId,
      })
    : null);

  await db.update(teamSubscriptionsTable).set({
    stripeSubscriptionId: subscription.id,
    entitlementSnapshotId: snapshot?.id ?? null,
    status: subscription.status,
    priceId: item.price.id,
    currentPeriodStart: fromStripeTimestamp(item.current_period_start),
    currentPeriodEnd: fromStripeTimestamp(item.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    paymentMethod: getPaymentMethod(subscription.default_payment_method),
    lastSyncedAt: now,
  }).where(eq(teamSubscriptionsTable.id, binding.id));

  return {
    hasAccess,
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: item.price.id,
    currentPeriodStart: item.current_period_start,
    currentPeriodEnd: item.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    paymentMethod: getPaymentMethod(subscription.default_payment_method),
  };
}
