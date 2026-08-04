import type { TeamEntitlementFeatures } from "@/db/schema";

export const FREE_PLAN = {
  key: "free",
  version: 1,
  features: {
    weekCreationLimit: 4,
    aiAssistant: false,
    pushNotifications: false,
  },
} as const satisfies {
  key: string;
  version: number;
  features: TeamEntitlementFeatures;
};

// Increment the version and edit this object when the paid offer changes.
// A purchase copies these values into an immutable database snapshot.
export const CURRENT_PAID_PLAN = {
  key: "list-to-ladle-pro",
  version: 1,
  features: {
    weekCreationLimit: null,
    aiAssistant: true,
    pushNotifications: true,
  },
} as const satisfies {
  key: string;
  version: number;
  features: TeamEntitlementFeatures;
};

export const SUBSCRIPTION_ACCESS_STATUSES = new Set([
  "active",
  "trialing",
]);

export function isSubscriptionAccessActive({
  status,
}: {
  currentPeriodEnd: Date | null;
  now?: Date;
  status: string;
}): boolean {
  return SUBSCRIPTION_ACCESS_STATUSES.has(status);
}

export function getWeeksRemaining({
  usageCount,
  weekCreationLimit,
}: {
  usageCount: number;
  weekCreationLimit: number | null;
}): number | null {
  if (weekCreationLimit === null) return null;
  return Math.max(0, weekCreationLimit - usageCount);
}
