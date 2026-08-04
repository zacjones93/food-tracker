import {
  AutoRenewStatus,
  Environment,
  Status,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

export interface AppleSubscriptionState {
  appAccountToken: string | null;
  autoRenewStatus: boolean;
  bundleId: string;
  currentPeriodEnd: Date | null;
  environment: string;
  gracePeriodExpiresAt: Date | null;
  hasAccess: boolean;
  lastRenewalSignedAt: Date | null;
  lastTransactionSignedAt: Date;
  originalTransactionId: string;
  productId: string;
  purchaseDate: Date | null;
  revocationDate: Date | null;
  status: "active" | "billing_retry" | "expired" | "grace_period" | "revoked";
  transactionId: string;
}

function fromAppleTimestamp(value: number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseAppleProductIds(value: string | undefined): string[] {
  return [...new Set((value ?? "")
    .split(",")
    .map((productId) => productId.trim())
    .filter(Boolean))];
}

export function getAppleStatus({
  expiresDate,
  gracePeriodExpiresDate,
  now = new Date(),
  revocationDate,
  status,
}: {
  expiresDate?: number;
  gracePeriodExpiresDate?: number;
  now?: Date;
  revocationDate?: number;
  status?: Status | number;
}): AppleSubscriptionState["status"] {
  if (revocationDate || status === Status.REVOKED) return "revoked";
  if (status === Status.BILLING_GRACE_PERIOD) return "grace_period";
  if (status === Status.BILLING_RETRY) return "billing_retry";
  if (status === Status.EXPIRED) return "expired";
  if (status === Status.ACTIVE) return "active";

  const gracePeriodEnd = fromAppleTimestamp(gracePeriodExpiresDate);
  if (gracePeriodEnd && gracePeriodEnd > now) return "grace_period";
  const periodEnd = fromAppleTimestamp(expiresDate);
  return periodEnd && periodEnd > now ? "active" : "expired";
}

export function isAppleSubscriptionAccessActive({
  currentPeriodEnd,
  gracePeriodExpiresAt,
  now = new Date(),
  status,
}: {
  currentPeriodEnd: Date | null;
  gracePeriodExpiresAt: Date | null;
  now?: Date;
  status: AppleSubscriptionState["status"] | string;
}): boolean {
  if (status === "grace_period") return Boolean(gracePeriodExpiresAt && gracePeriodExpiresAt > now);
  return status === "active" && Boolean(currentPeriodEnd && currentPeriodEnd > now);
}

export function createAppleSubscriptionState({
  now = new Date(),
  renewal,
  status,
  transaction,
}: {
  now?: Date;
  renewal?: JWSRenewalInfoDecodedPayload | null;
  status?: Status | number;
  transaction: JWSTransactionDecodedPayload;
}): AppleSubscriptionState {
  if (!transaction.originalTransactionId) throw new Error("Apple transaction is missing originalTransactionId");
  if (!transaction.transactionId) throw new Error("Apple transaction is missing transactionId");
  if (!transaction.productId) throw new Error("Apple transaction is missing productId");
  if (!transaction.bundleId) throw new Error("Apple transaction is missing bundleId");
  if (!transaction.environment) throw new Error("Apple transaction is missing environment");
  const lastTransactionSignedAt = fromAppleTimestamp(transaction.signedDate);
  if (!lastTransactionSignedAt) throw new Error("Apple transaction is missing signedDate");

  const resolvedStatus = getAppleStatus({
    expiresDate: transaction.expiresDate,
    gracePeriodExpiresDate: renewal?.gracePeriodExpiresDate,
    now,
    revocationDate: transaction.revocationDate,
    status,
  });

  const currentPeriodEnd = fromAppleTimestamp(transaction.expiresDate);
  const gracePeriodExpiresAt = fromAppleTimestamp(renewal?.gracePeriodExpiresDate);
  return {
    appAccountToken: transaction.appAccountToken ?? renewal?.appAccountToken ?? null,
    autoRenewStatus: renewal?.autoRenewStatus === AutoRenewStatus.ON,
    bundleId: transaction.bundleId,
    currentPeriodEnd,
    environment: String(transaction.environment),
    gracePeriodExpiresAt,
    hasAccess: isAppleSubscriptionAccessActive({
      currentPeriodEnd,
      gracePeriodExpiresAt,
      now,
      status: resolvedStatus,
    }),
    lastRenewalSignedAt: fromAppleTimestamp(renewal?.signedDate),
    lastTransactionSignedAt,
    originalTransactionId: transaction.originalTransactionId,
    productId: transaction.productId,
    purchaseDate: fromAppleTimestamp(transaction.purchaseDate),
    revocationDate: fromAppleTimestamp(transaction.revocationDate),
    status: resolvedStatus,
    transactionId: transaction.transactionId,
  };
}

export function isSupportedAppleEnvironment(value: string): boolean {
  return value === Environment.PRODUCTION || value === Environment.SANDBOX;
}

export function shouldApplyAppleSubscriptionUpdate({
  currentRenewalSignedAt,
  currentTransactionSignedAt,
  nextRenewalSignedAt,
  nextTransactionSignedAt,
}: {
  currentRenewalSignedAt: Date | null;
  currentTransactionSignedAt: Date | null;
  nextRenewalSignedAt: Date | null;
  nextTransactionSignedAt: Date;
}): boolean {
  if (!currentTransactionSignedAt) return true;
  if (nextTransactionSignedAt > currentTransactionSignedAt) return true;
  if (nextTransactionSignedAt < currentTransactionSignedAt) return false;
  if (!currentRenewalSignedAt) return true;
  return Boolean(nextRenewalSignedAt && nextRenewalSignedAt >= currentRenewalSignedAt);
}
