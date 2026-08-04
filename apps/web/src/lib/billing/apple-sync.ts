import "server-only";

import { getDB } from "@/db";
import {
  appleServerNotificationEventsTable,
  appleSubscriptionBindingsTable,
  teamEntitlementSnapshotsTable,
} from "@/db/schema";
import { CURRENT_PAID_PLAN } from "@/lib/entitlements/features";
import {
  Environment,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type Status,
} from "@apple/app-store-server-library";
import { and, eq, sql } from "drizzle-orm";
import {
  createAppleSubscriptionState,
  shouldApplyAppleSubscriptionUpdate,
  type AppleSubscriptionState,
} from "./apple-subscription-state";
import {
  getAppleServerConfiguration,
  getAppStoreServerAPIClient,
  verifyAppleNotification,
  verifyAppleRenewalInfoInEnvironment,
  verifyAppleTransaction,
  verifyAppleTransactionInEnvironment,
} from "./apple-store";

async function getOrCreateAppleEntitlementSnapshot({
  originalTransactionId,
  teamId,
}: {
  originalTransactionId: string;
  teamId: string;
}) {
  const db = getDB();
  const source = "apple_subscription";
  const existing = await db.query.teamEntitlementSnapshotsTable.findFirst({
    where: and(
      eq(teamEntitlementSnapshotsTable.source, source),
      eq(teamEntitlementSnapshotsTable.sourceId, originalTransactionId),
    ),
  });
  if (existing) {
    if (existing.teamId !== teamId) throw new Error("Apple subscription is already bound to another team");
    return existing;
  }

  await db.insert(teamEntitlementSnapshotsTable).values({
    teamId,
    source,
    sourceId: originalTransactionId,
    planKey: CURRENT_PAID_PLAN.key,
    planVersion: CURRENT_PAID_PLAN.version,
    features: { ...CURRENT_PAID_PLAN.features },
  }).onConflictDoNothing({
    target: [teamEntitlementSnapshotsTable.source, teamEntitlementSnapshotsTable.sourceId],
  });
  const created = await db.query.teamEntitlementSnapshotsTable.findFirst({
    where: and(
      eq(teamEntitlementSnapshotsTable.source, source),
      eq(teamEntitlementSnapshotsTable.sourceId, originalTransactionId),
    ),
  });
  if (!created || created.teamId !== teamId) throw new Error("Unable to create Apple entitlement snapshot");
  return created;
}

export async function getOrCreateAppleSubscriptionBinding({
  teamId,
}: {
  teamId: string;
}) {
  const db = getDB();
  const existing = await db.query.appleSubscriptionBindingsTable.findFirst({
    where: eq(appleSubscriptionBindingsTable.teamId, teamId),
  });
  if (existing) return existing;

  await db.insert(appleSubscriptionBindingsTable).values({
    teamId,
    appAccountToken: crypto.randomUUID().toLowerCase(),
  }).onConflictDoNothing({ target: appleSubscriptionBindingsTable.teamId });
  const created = await db.query.appleSubscriptionBindingsTable.findFirst({
    where: eq(appleSubscriptionBindingsTable.teamId, teamId),
  });
  if (!created) throw new Error("Unable to create Apple subscription binding");
  return created;
}

async function syncAppleStateToTeam({
  state,
  teamId,
}: {
  state: AppleSubscriptionState;
  teamId: string;
}) {
  const db = getDB();
  const configuration = getAppleServerConfiguration();
  if (!configuration.productIds.includes(state.productId)) throw new Error("Unrecognized Apple product identifier");
  if (state.bundleId !== configuration.bundleId) throw new Error("Apple transaction bundle ID does not match");

  const binding = await getOrCreateAppleSubscriptionBinding({ teamId });
  const boundTransaction = await db.query.appleSubscriptionBindingsTable.findFirst({
    where: eq(appleSubscriptionBindingsTable.originalTransactionId, state.originalTransactionId),
  });
  if (boundTransaction && boundTransaction.teamId !== teamId) {
    throw new Error("Apple subscription is already bound to another team");
  }
  if (state.appAccountToken && state.appAccountToken.toLowerCase() !== binding.appAccountToken.toLowerCase()) {
    throw new Error("Apple transaction belongs to a different team account token");
  }

  if (!shouldApplyAppleSubscriptionUpdate({
    currentRenewalSignedAt: binding.lastRenewalSignedAt,
    currentTransactionSignedAt: binding.lastTransactionSignedAt,
    nextRenewalSignedAt: state.lastRenewalSignedAt,
    nextTransactionSignedAt: state.lastTransactionSignedAt,
  })) {
    return { binding, ignoredAsStale: true };
  }
  const snapshot = state.hasAccess
    ? await getOrCreateAppleEntitlementSnapshot({
        originalTransactionId: state.originalTransactionId,
        teamId,
      })
    : null;
  const now = new Date();
  await db.update(appleSubscriptionBindingsTable).set({
    autoRenewStatus: state.autoRenewStatus,
    bundleId: state.bundleId,
    currentPeriodEnd: state.currentPeriodEnd,
    entitlementSnapshotId: snapshot?.id ?? binding.entitlementSnapshotId,
    environment: state.environment,
    gracePeriodExpiresAt: state.gracePeriodExpiresAt,
    lastRenewalSignedAt: state.lastRenewalSignedAt ?? binding.lastRenewalSignedAt,
    lastSyncedAt: now,
    lastTransactionId: state.transactionId,
    lastTransactionSignedAt: state.lastTransactionSignedAt,
    originalTransactionId: state.originalTransactionId,
    productId: state.productId,
    purchaseDate: state.purchaseDate,
    revocationDate: state.revocationDate,
    status: state.status,
  }).where(eq(appleSubscriptionBindingsTable.id, binding.id));

  return {
    binding: {
      ...binding,
      entitlementSnapshotId: snapshot?.id ?? binding.entitlementSnapshotId,
      originalTransactionId: state.originalTransactionId,
      status: state.status,
    },
    ignoredAsStale: false,
  };
}

async function reconcileWithAppStoreServer({
  environment,
  submittedState,
}: {
  environment: Environment;
  submittedState: AppleSubscriptionState;
}): Promise<AppleSubscriptionState> {
  const client = getAppStoreServerAPIClient(environment);
  if (!client) return submittedState;

  const response = await client.getAllSubscriptionStatuses(submittedState.originalTransactionId);
  const candidates = (response.data ?? []).flatMap((group) => group.lastTransactions ?? [])
    .filter((item) => item.originalTransactionId === submittedState.originalTransactionId)
    .filter((item) => Boolean(item.signedTransactionInfo));
  const verified = await Promise.all(candidates.map(async (item) => {
    const transaction = await verifyAppleTransactionInEnvironment({
      environment,
      signedTransaction: item.signedTransactionInfo!,
    });
    const renewal = item.signedRenewalInfo
      ? await verifyAppleRenewalInfoInEnvironment({
          environment,
          signedRenewalInfo: item.signedRenewalInfo,
        })
      : null;
    return createAppleSubscriptionState({
      renewal,
      status: item.status,
      transaction,
    });
  }));
  const recognized = verified
    .filter((state) => getAppleServerConfiguration().productIds.includes(state.productId))
    .sort((left, right) => right.lastTransactionSignedAt.getTime() - left.lastTransactionSignedAt.getTime());
  return recognized[0] ?? submittedState;
}

export async function synchronizeAppleTransactionForTeam({
  signedTransaction,
  teamId,
}: {
  signedTransaction: string;
  teamId: string;
}) {
  const verified = await verifyAppleTransaction(signedTransaction);
  const submittedState = createAppleSubscriptionState({ transaction: verified.value });
  const state = await reconcileWithAppStoreServer({
    environment: verified.environment,
    submittedState,
  });
  const outcome = await syncAppleStateToTeam({ state, teamId });

  if (!state.appAccountToken) {
    const client = getAppStoreServerAPIClient(verified.environment);
    await client?.setAppAccountToken(state.originalTransactionId, {
      appAccountToken: outcome.binding.appAccountToken,
    });
  }
  return { hasAccess: state.hasAccess, status: state.status };
}

async function beginNotificationEvent(notification: ResponseBodyV2DecodedPayload) {
  if (!notification.notificationUUID) throw new Error("Apple notification is missing notificationUUID");
  const db = getDB();
  await db.insert(appleServerNotificationEventsTable).values({
    notificationUuid: notification.notificationUUID,
    notificationType: notification.notificationType ? String(notification.notificationType) : null,
    signedAt: notification.signedDate ? new Date(notification.signedDate) : null,
    status: "pending",
    subtype: notification.subtype ? String(notification.subtype) : null,
  }).onConflictDoNothing({ target: appleServerNotificationEventsTable.notificationUuid });
  const event = await db.query.appleServerNotificationEventsTable.findFirst({
    where: eq(appleServerNotificationEventsTable.notificationUuid, notification.notificationUUID),
  });
  if (!event) throw new Error("Unable to record Apple notification");
  return event;
}

export async function processAppleServerNotification({
  signedPayload,
}: {
  signedPayload: string;
}) {
  const verified = await verifyAppleNotification(signedPayload);
  const notification = verified.value;
  const event = await beginNotificationEvent(notification);
  if (event.status === "processed" || event.status === "ignored") return { duplicate: true };

  const db = getDB();
  try {
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) {
      await db.update(appleServerNotificationEventsTable).set({
        processedAt: new Date(),
        status: "ignored",
      }).where(eq(appleServerNotificationEventsTable.id, event.id));
      return { ignored: true };
    }

    const transaction = await verifyAppleTransactionInEnvironment({
      environment: verified.environment,
      signedTransaction,
    });
    const renewal: JWSRenewalInfoDecodedPayload | null = notification.data?.signedRenewalInfo
      ? await verifyAppleRenewalInfoInEnvironment({
          environment: verified.environment,
          signedRenewalInfo: notification.data.signedRenewalInfo,
        })
      : null;
    const state = createAppleSubscriptionState({
      renewal,
      status: notification.data?.status as Status | number | undefined,
      transaction,
    });
    const binding = await db.query.appleSubscriptionBindingsTable.findFirst({
      where: state.appAccountToken
        ? sql`${appleSubscriptionBindingsTable.originalTransactionId} = ${state.originalTransactionId} OR ${appleSubscriptionBindingsTable.appAccountToken} = ${state.appAccountToken.toLowerCase()}`
        : eq(appleSubscriptionBindingsTable.originalTransactionId, state.originalTransactionId),
    });
    if (!binding) {
      await db.update(appleServerNotificationEventsTable).set({
        originalTransactionId: state.originalTransactionId,
        processedAt: new Date(),
        status: "ignored",
      }).where(eq(appleServerNotificationEventsTable.id, event.id));
      return { ignored: true };
    }

    await syncAppleStateToTeam({ state, teamId: binding.teamId });
    await db.update(appleServerNotificationEventsTable).set({
      error: null,
      originalTransactionId: state.originalTransactionId,
      processedAt: new Date(),
      status: "processed",
    }).where(eq(appleServerNotificationEventsTable.id, event.id));
    return { processed: true };
  } catch (error) {
    await db.update(appleServerNotificationEventsTable).set({
      attempts: sql`${appleServerNotificationEventsTable.attempts} + 1`,
      error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown processing error",
      status: "failed",
    }).where(eq(appleServerNotificationEventsTable.id, event.id));
    throw error;
  }
}
