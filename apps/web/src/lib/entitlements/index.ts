import "server-only";

import { cache } from "react";
import { alias } from "drizzle-orm/sqlite-core";
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
const stripeSnapshots = alias(teamEntitlementSnapshotsTable, "stripeSnapshot");
const appleSnapshots = alias(teamEntitlementSnapshotsTable, "appleSnapshot");

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

export function getTeamEntitlements({ teamId }: { teamId: string }): Promise<TeamEntitlements> {
  return getCachedTeamEntitlements(teamId);
}

// Primitive key deduplicates layout/page reads even when callers create new objects.
const getCachedTeamEntitlements = cache(async function loadTeamEntitlements(teamId: string): Promise<TeamEntitlements> {
  const db = getDB();
  const [stripeRows, appleRows, usageRows] = await db.batch([
    db.select({
      status: teamSubscriptionsTable.status,
      currentPeriodEnd: teamSubscriptionsTable.currentPeriodEnd,
      id: stripeSnapshots.id,
      planKey: stripeSnapshots.planKey,
      planVersion: stripeSnapshots.planVersion,
      features: stripeSnapshots.features,
    })
      .from(teamSubscriptionsTable)
      .leftJoin(stripeSnapshots, eq(stripeSnapshots.id, teamSubscriptionsTable.entitlementSnapshotId))
      .where(eq(teamSubscriptionsTable.teamId, teamId)).limit(1),
    db.select({
      status: appleSubscriptionBindingsTable.status,
      currentPeriodEnd: appleSubscriptionBindingsTable.currentPeriodEnd,
      gracePeriodExpiresAt: appleSubscriptionBindingsTable.gracePeriodExpiresAt,
      id: appleSnapshots.id,
      planKey: appleSnapshots.planKey,
      planVersion: appleSnapshots.planVersion,
      features: appleSnapshots.features,
    })
      .from(appleSubscriptionBindingsTable)
      .leftJoin(appleSnapshots, eq(appleSnapshots.id, appleSubscriptionBindingsTable.entitlementSnapshotId))
      .where(eq(appleSubscriptionBindingsTable.teamId, teamId)).limit(1),
    db.select({ usageCount: teamFeatureUsageTable.usageCount }).from(teamFeatureUsageTable)
      .where(and(
        eq(teamFeatureUsageTable.teamId, teamId),
        eq(teamFeatureUsageTable.feature, WEEK_CREATIONS_FEATURE),
      )).limit(1),
  ]);
  const subscription = stripeRows[0];
  const stripeSnapshot = stripeRows[0]?.id ? stripeRows[0] : null;
  const appleSubscription = appleRows[0];
  const appleSnapshot = appleRows[0]?.id ? appleRows[0] : null;
  const usage = usageRows[0];
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
        key: activeSnapshot.planKey!,
        version: activeSnapshot.planVersion!,
        features: activeSnapshot.features!,
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
});

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
