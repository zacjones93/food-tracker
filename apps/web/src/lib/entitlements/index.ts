import "server-only";

import { getDB } from "@/db";
import {
  appleSubscriptionBindingsTable,
  teamEntitlementSnapshotsTable,
  teamFeatureUsageTable,
  teamSubscriptionsTable,
  type TeamEntitlementFeatures,
} from "@/db/schema";
import { isAppleSubscriptionAccessActive } from "@/lib/billing/apple-subscription-state";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
  FREE_PLAN,
  getWeeksRemaining,
  isSubscriptionAccessActive,
} from "./features";

const WEEK_CREATIONS_FEATURE = "week_creations";

export interface TeamEntitlements {
  planKey: string;
  planVersion: number;
  providers: Array<"apple" | "stripe">;
  source: "apple" | "free" | "stripe";
  subscriptionStatus: string;
  features: TeamEntitlementFeatures;
  usage: {
    weeksCreated: number;
    weeksRemaining: number | null;
  };
}

export class EntitlementError extends Error {
  readonly code = "SUBSCRIPTION_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}

export async function getTeamEntitlements({
  teamId,
}: {
  teamId: string;
}): Promise<TeamEntitlements> {
  const db = getDB();
  const [subscription, appleSubscription, usage] = await Promise.all([
    db.query.teamSubscriptionsTable.findFirst({
      where: eq(teamSubscriptionsTable.teamId, teamId),
    }),
    db.query.appleSubscriptionBindingsTable.findFirst({
      where: eq(appleSubscriptionBindingsTable.teamId, teamId),
    }),
    db.query.teamFeatureUsageTable.findFirst({
      where: and(
        eq(teamFeatureUsageTable.teamId, teamId),
        eq(teamFeatureUsageTable.feature, WEEK_CREATIONS_FEATURE),
      ),
    }),
  ]);

  const stripeSnapshot = subscription?.entitlementSnapshotId
    ? await db.query.teamEntitlementSnapshotsTable.findFirst({
        where: eq(teamEntitlementSnapshotsTable.id, subscription.entitlementSnapshotId),
      })
    : null;
  const appleSnapshot = appleSubscription?.entitlementSnapshotId
    ? await db.query.teamEntitlementSnapshotsTable.findFirst({
        where: eq(teamEntitlementSnapshotsTable.id, appleSubscription.entitlementSnapshotId),
      })
    : null;
  const hasStripeAccess = Boolean(
    subscription &&
    stripeSnapshot &&
    isSubscriptionAccessActive({
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    }),
  );
  const hasAppleAccess = Boolean(
    appleSubscription &&
    appleSnapshot &&
    isAppleSubscriptionAccessActive({
      currentPeriodEnd: appleSubscription.currentPeriodEnd,
      gracePeriodExpiresAt: appleSubscription.gracePeriodExpiresAt,
      status: appleSubscription.status,
    }),
  );
  const activeSnapshot = hasAppleAccess ? appleSnapshot : (hasStripeAccess ? stripeSnapshot : null);
  const plan = activeSnapshot
    ? {
        key: activeSnapshot.planKey,
        version: activeSnapshot.planVersion,
        features: activeSnapshot.features,
      }
    : FREE_PLAN;
  const weeksCreated = usage?.usageCount ?? 0;
  const providers: TeamEntitlements["providers"] = [];
  if (hasStripeAccess) providers.push("stripe");
  if (hasAppleAccess) providers.push("apple");
  const source = hasAppleAccess ? "apple" : (hasStripeAccess ? "stripe" : "free");

  return {
    planKey: plan.key,
    planVersion: plan.version,
    providers,
    source,
    subscriptionStatus: source === "apple"
      ? (appleSubscription?.status ?? "none")
      : (subscription?.status ?? "none"),
    features: plan.features,
    usage: {
      weeksCreated,
      weeksRemaining: getWeeksRemaining({
        usageCount: weeksCreated,
        weekCreationLimit: plan.features.weekCreationLimit,
      }),
    },
  };
}

export async function requireTeamFeature({
  feature,
  teamId,
}: {
  feature: "aiAssistant" | "pushNotifications";
  teamId: string;
}): Promise<TeamEntitlements> {
  const entitlements = await getTeamEntitlements({ teamId });
  if (!entitlements.features[feature]) {
    throw new EntitlementError("This feature requires a List To Ladle Pro subscription");
  }
  return entitlements;
}

export async function reserveTeamWeekCreation({
  teamId,
}: {
  teamId: string;
}): Promise<void> {
  const db = getDB();
  const entitlements = await getTeamEntitlements({ teamId });

  await db.insert(teamFeatureUsageTable).values({
    teamId,
    feature: WEEK_CREATIONS_FEATURE,
    usageCount: 0,
  }).onConflictDoNothing({
    target: [teamFeatureUsageTable.teamId, teamFeatureUsageTable.feature],
  });

  const limit = entitlements.features.weekCreationLimit;
  const where = limit === null
    ? and(
        eq(teamFeatureUsageTable.teamId, teamId),
        eq(teamFeatureUsageTable.feature, WEEK_CREATIONS_FEATURE),
      )
    : and(
        eq(teamFeatureUsageTable.teamId, teamId),
        eq(teamFeatureUsageTable.feature, WEEK_CREATIONS_FEATURE),
        lt(teamFeatureUsageTable.usageCount, limit),
      );
  const reserved = await db.update(teamFeatureUsageTable)
    .set({ usageCount: sql`${teamFeatureUsageTable.usageCount} + 1` })
    .where(where)
    .returning({ usageCount: teamFeatureUsageTable.usageCount });

  if (reserved.length === 0) {
    throw new EntitlementError(
      "Your team has used its four free week creations. Subscribe to create another week.",
    );
  }
}

export async function releaseTeamWeekCreation({
  teamId,
}: {
  teamId: string;
}): Promise<void> {
  const db = getDB();
  await db.update(teamFeatureUsageTable)
    .set({ usageCount: sql`${teamFeatureUsageTable.usageCount} - 1` })
    .where(and(
      eq(teamFeatureUsageTable.teamId, teamId),
      eq(teamFeatureUsageTable.feature, WEEK_CREATIONS_FEATURE),
      gt(teamFeatureUsageTable.usageCount, 0),
    ));
}
