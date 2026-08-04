import type {
  ApnsEnvironment,
  DeliveryRepository,
  DeliveryStatus,
  PushDelivery,
} from "./delivery";

interface PushDeliveryRow {
  apnsId: string;
  body: string;
  destination: string | null;
  deviceBundleId: string | null;
  deviceEnabled: number | null;
  deviceEnvironment: string | null;
  deviceId: string;
  deviceToken: string | null;
  id: string;
  leaseExpiresAt: number | null;
  membershipActive: number;
  preferenceEnabled: number;
  status: string;
  title: string;
}

export function createD1DeliveryRepository(db: D1Database): DeliveryRepository {
  return {
    async claim({ deliveryId, leaseExpiresAt, now }) {
      const result = await db.prepare(`
        UPDATE notification_push_deliveries
        SET status = 'sending',
            attemptCount = attemptCount + 1,
            leaseExpiresAt = ?1,
            lastAttemptAt = ?2,
            updatedAt = ?2,
            updateCounter = COALESCE(updateCounter, 0) + 1
        WHERE id = ?3
          AND (
            status IN ('pending', 'retryable')
            OR (status = 'sending' AND leaseExpiresAt <= ?2)
          )
      `).bind(leaseExpiresAt, now, deliveryId).run();
      return result.meta.changes === 1;
    },

    async disableInvalidDevice({ deviceId, deviceToken, now }) {
      await db.prepare(`
        UPDATE notification_push_devices
        SET enabled = 0,
            disabledAt = ?1,
            updatedAt = ?1,
            updateCounter = COALESCE(updateCounter, 0) + 1
        WHERE id = ?2 AND token = ?3
      `).bind(now, deviceId, deviceToken).run();
    },

    async find(deliveryId) {
      const row = await db.prepare(`
        SELECT delivery.id,
               delivery.status,
               delivery.apnsId,
               delivery.title,
               delivery.body,
               delivery.destination,
               delivery.leaseExpiresAt,
               delivery.pushDeviceId AS deviceId,
               device.token AS deviceToken,
               device.enabled AS deviceEnabled,
               device.environment AS deviceEnvironment,
               device.bundleId AS deviceBundleId,
               CASE WHEN membership.id IS NULL THEN 0 ELSE 1 END AS membershipActive,
               COALESCE(preference.pushEnabled, 0) AS preferenceEnabled
        FROM notification_push_deliveries AS delivery
        LEFT JOIN team_membership AS membership
          ON membership.teamId = delivery.teamId
         AND membership.userId = delivery.userId
         AND membership.isActive = 1
        LEFT JOIN notification_push_preferences AS preference
          ON preference.teamId = delivery.teamId
         AND preference.userId = delivery.userId
         AND preference.topic = delivery.topic
         AND preference.pushEnabled = 1
        LEFT JOIN notification_push_devices AS device
          ON device.id = delivery.pushDeviceId
         AND device.userId = delivery.userId
        WHERE delivery.id = ?1
        LIMIT 1
      `).bind(deliveryId).first<PushDeliveryRow>();
      return row ? toPushDelivery(row) : undefined;
    },

    async markAccepted({ acceptedAt, deliveryId, providerMessageId }) {
      await db.prepare(`
        UPDATE notification_push_deliveries
        SET status = 'accepted',
            acceptedAt = ?1,
            providerMessageId = ?2,
            providerCode = NULL,
            lastError = NULL,
            leaseExpiresAt = NULL,
            updatedAt = ?1,
            updateCounter = COALESCE(updateCounter, 0) + 1
        WHERE id = ?3 AND status = 'sending'
      `).bind(acceptedAt, providerMessageId, deliveryId).run();
    },

    async markFailed({ deliveryId, failedAt, message, providerCode }) {
      await db.prepare(`
        UPDATE notification_push_deliveries
        SET status = 'failed',
            failedAt = ?1,
            providerCode = ?2,
            lastError = ?3,
            leaseExpiresAt = NULL,
            updatedAt = ?1,
            updateCounter = COALESCE(updateCounter, 0) + 1
        WHERE id = ?4 AND status = 'sending'
      `).bind(failedAt, providerCode ?? null, message, deliveryId).run();
    },

    async markRetryable({ deliveryId, message, providerCode, updatedAt }) {
      await db.prepare(`
        UPDATE notification_push_deliveries
        SET status = 'retryable',
            providerCode = ?1,
            lastError = ?2,
            leaseExpiresAt = NULL,
            updatedAt = ?3,
            updateCounter = COALESCE(updateCounter, 0) + 1
        WHERE id = ?4 AND status = 'sending'
      `).bind(providerCode ?? null, message, updatedAt, deliveryId).run();
    },

    async markSuppressed({ deliveryId, reason, suppressedAt }) {
      await db.prepare(`
        UPDATE notification_push_deliveries
        SET status = 'suppressed',
            suppressedAt = ?1,
            providerCode = ?2,
            lastError = NULL,
            leaseExpiresAt = NULL,
            updatedAt = ?1,
            updateCounter = COALESCE(updateCounter, 0) + 1
        WHERE id = ?3
          AND status NOT IN ('accepted', 'failed', 'suppressed')
      `).bind(suppressedAt, reason, deliveryId).run();
    },
  };
}

function toPushDelivery(row: PushDeliveryRow): PushDelivery {
  return {
    apnsId: row.apnsId,
    body: row.body,
    destination: row.destination ?? undefined,
    deviceBundleId: row.deviceBundleId ?? undefined,
    deviceEnabled: row.deviceEnabled === 1,
    deviceEnvironment: isApnsEnvironment(row.deviceEnvironment)
      ? row.deviceEnvironment
      : undefined,
    deviceId: row.deviceId,
    deviceToken: row.deviceToken ?? undefined,
    id: row.id,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    membershipActive: row.membershipActive === 1,
    preferenceEnabled: row.preferenceEnabled === 1,
    status: toDeliveryStatus(row.status),
    title: row.title,
  };
}

function isApnsEnvironment(value: string | null): value is ApnsEnvironment {
  return value === "production" || value === "sandbox";
}

function toDeliveryStatus(value: string): DeliveryStatus {
  if (
    value === "accepted" ||
    value === "failed" ||
    value === "pending" ||
    value === "retryable" ||
    value === "sending" ||
    value === "suppressed"
  ) return value;
  throw new Error(`Unsupported push delivery status: ${value}`);
}
