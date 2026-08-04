import type { PushProvider } from "./push-provider";
import { isPushProviderError } from "./push-provider";

export type ApnsEnvironment = "production" | "sandbox";

export type DeliveryStatus =
  | "accepted"
  | "failed"
  | "pending"
  | "retryable"
  | "sending"
  | "suppressed";

export interface PushDelivery {
  apnsId: string;
  body: string;
  destination?: string;
  deviceBundleId?: string;
  deviceEnabled: boolean;
  deviceEnvironment?: ApnsEnvironment;
  deviceId: string;
  deviceToken?: string;
  id: string;
  leaseExpiresAt?: number;
  membershipActive: boolean;
  preferenceEnabled: boolean;
  status: DeliveryStatus;
  title: string;
}

export interface DeliveryRepository {
  claim(input: { deliveryId: string; leaseExpiresAt: number; now: number }): Promise<boolean>;
  disableInvalidDevice(input: {
    deviceId: string;
    deviceToken: string;
    now: number;
  }): Promise<void>;
  find(deliveryId: string): Promise<PushDelivery | undefined>;
  markAccepted(input: {
    acceptedAt: number;
    deliveryId: string;
    providerMessageId: string;
  }): Promise<void>;
  markFailed(input: {
    deliveryId: string;
    failedAt: number;
    message: string;
    providerCode?: string;
  }): Promise<void>;
  markRetryable(input: {
    deliveryId: string;
    message: string;
    providerCode?: string;
    updatedAt: number;
  }): Promise<void>;
  markSuppressed(input: {
    deliveryId: string;
    reason: SuppressionReason;
    suppressedAt: number;
  }): Promise<void>;
}

export type ProcessDeliveryResult = "complete" | "retry";

export type SuppressionReason =
  | "bundle_mismatch"
  | "device_disabled"
  | "device_missing"
  | "environment_mismatch"
  | "kill_switch"
  | "membership_inactive"
  | "preference_disabled";

const DELIVERY_LEASE_SECONDS = 45;
const TERMINAL_STATUSES = new Set<DeliveryStatus>(["accepted", "failed", "suppressed"]);

export async function processPushDelivery({
  bundleId,
  deliveryId,
  environment,
  now = () => new Date(),
  provider,
  repository,
}: {
  bundleId: string;
  deliveryId: string;
  environment: ApnsEnvironment;
  now?: () => Date;
  provider: PushProvider;
  repository: DeliveryRepository;
}): Promise<ProcessDeliveryResult> {
  const initialDelivery = await repository.find(deliveryId);
  if (!initialDelivery || TERMINAL_STATUSES.has(initialDelivery.status)) return "complete";

  const initialSuppression = getSuppressionReason({
    bundleId,
    delivery: initialDelivery,
    environment,
  });
  if (initialSuppression) {
    await repository.markSuppressed({
      deliveryId,
      reason: initialSuppression,
      suppressedAt: toEpochSeconds(now()),
    });
    return "complete";
  }

  const claimTime = toEpochSeconds(now());
  const didClaim = await repository.claim({
    deliveryId,
    leaseExpiresAt: claimTime + DELIVERY_LEASE_SECONDS,
    now: claimTime,
  });
  if (!didClaim) {
    const currentDelivery = await repository.find(deliveryId);
    if (!currentDelivery || TERMINAL_STATUSES.has(currentDelivery.status)) return "complete";
    return "retry";
  }

  // Re-read all authorization and destination state after winning the lease.
  // This is the final check immediately before the external provider call.
  const delivery = await repository.find(deliveryId);
  if (!delivery) return "complete";
  const suppression = getSuppressionReason({ bundleId, delivery, environment });
  if (suppression) {
    await repository.markSuppressed({
      deliveryId,
      reason: suppression,
      suppressedAt: toEpochSeconds(now()),
    });
    return "complete";
  }
  if (!delivery.deviceToken) {
    await repository.markSuppressed({
      deliveryId,
      reason: "device_missing",
      suppressedAt: toEpochSeconds(now()),
    });
    return "complete";
  }

  try {
    const result = await provider.send({
      alert: { body: delivery.body, title: delivery.title },
      apnsId: delivery.apnsId,
      collapseId: delivery.id,
      deliveryId: delivery.id,
      destination: delivery.destination,
      deviceToken: delivery.deviceToken,
    });
    await repository.markAccepted({
      acceptedAt: toEpochSeconds(result.acceptedAt),
      deliveryId,
      providerMessageId: result.providerMessageId,
    });
    return "complete";
  } catch (error) {
    const message = safeErrorMessage(error);
    if (isPushProviderError(error) && error.invalidateDeviceToken) {
      await repository.disableInvalidDevice({
        deviceId: delivery.deviceId,
        deviceToken: delivery.deviceToken,
        now: toEpochSeconds(now()),
      });
      await repository.markFailed({
        deliveryId,
        failedAt: toEpochSeconds(now()),
        message,
        providerCode: error.providerCode,
      });
      return "complete";
    }
    if (isPushProviderError(error) && !error.retryable) {
      await repository.markFailed({
        deliveryId,
        failedAt: toEpochSeconds(now()),
        message,
        providerCode: error.providerCode,
      });
      return "complete";
    }

    await repository.markRetryable({
      deliveryId,
      message,
      providerCode: isPushProviderError(error) ? error.providerCode : undefined,
      updatedAt: toEpochSeconds(now()),
    });
    return "retry";
  }
}

function getSuppressionReason({
  bundleId,
  delivery,
  environment,
}: {
  bundleId: string;
  delivery: PushDelivery;
  environment: ApnsEnvironment;
}): SuppressionReason | undefined {
  if (!delivery.membershipActive) return "membership_inactive";
  if (!delivery.preferenceEnabled) return "preference_disabled";
  if (!delivery.deviceToken) return "device_missing";
  if (!delivery.deviceEnabled) return "device_disabled";
  if (delivery.deviceBundleId !== bundleId) return "bundle_mismatch";
  if (delivery.deviceEnvironment !== environment) return "environment_mismatch";
  return undefined;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown push provider failure";
  return error.message.slice(0, 1_000);
}

function toEpochSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}
