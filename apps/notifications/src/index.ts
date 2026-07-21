import { parseTelnyxEventEnvelope, verifyTelnyxWebhook } from "./telnyx-webhook";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const RETRY_DELAY_SECONDS = 60;

interface DeliveryQueueMessage {
  deliveryId: string;
  kind: "sms_delivery";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest({ env, request });
  },

  async queue(batch: MessageBatch<DeliveryQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (!isDeliveryQueueMessage(message.body)) {
        logError({ event: "notification_queue_invalid_message", messageId: message.id });
        message.ack();
        continue;
      }

      if (!isEnabled(env.NOTIFICATIONS_ENABLED) || !isEnabled(env.SMS_ENABLED)) {
        logInfo({
          deliveryId: message.body.deliveryId,
          event: "notification_delivery_suppressed",
          reason: "kill_switch",
        });
        message.ack();
        continue;
      }

      // D1 eligibility, consent, membership, preference, and opt-out checks must be
      // implemented before this kill switch can safely be enabled.
      logError({
        deliveryId: message.body.deliveryId,
        event: "notification_delivery_not_ready",
        reason: "persistence_not_implemented",
      });
      message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!isEnabled(env.NOTIFICATIONS_ENABLED)) {
      logInfo({
        event: "notification_scheduler_skipped",
        reason: "kill_switch",
        scheduledTime: controller.scheduledTime,
      });
      return;
    }

    // The due-time query is intentionally blocked until the notification schema
    // and exact migration state have been reviewed and generated through Drizzle.
    logError({
      event: "notification_scheduler_not_ready",
      reason: "persistence_not_implemented",
      scheduledTime: controller.scheduledTime,
    });
  },
} satisfies ExportedHandler<Env, DeliveryQueueMessage>;

async function handleRequest({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") return healthResponse(env);
  if (request.method === "POST" && url.pathname === "/webhooks/telnyx") {
    return handleTelnyxWebhook({ env, request });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

function healthResponse(env: Env): Response {
  const notificationsEnabled = isEnabled(env.NOTIFICATIONS_ENABLED);
  const smsEnabled = isEnabled(env.SMS_ENABLED);

  return Response.json({
    checks: {
      canonicalUrlConfigured: env.PUBLIC_APP_URL === "https://listtoladle.com",
      d1Bound: Boolean(env.DB),
      deliveryQueueBound: Boolean(env.DELIVERY_QUEUE),
      telnyxApiKeyConfigured: Boolean(env.TELNYX_API_KEY),
      telnyxPublicKeyConfigured: Boolean(env.TELNYX_PUBLIC_KEY),
    },
    notificationsEnabled,
    ready: false,
    smsEnabled,
    status: notificationsEnabled || smsEnabled ? "blocked" : "disabled",
  });
}

async function handleTelnyxWebhook({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const signature = request.headers.get("telnyx-signature-ed25519");
  const timestamp = request.headers.get("telnyx-timestamp");
  if (!env.TELNYX_PUBLIC_KEY || !signature || !timestamp) {
    return Response.json({ error: "webhook_verification_unavailable" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const isValid = await verifyTelnyxWebhook({
    publicKey: env.TELNYX_PUBLIC_KEY,
    rawBody,
    signature,
    timestamp,
  });
  if (!isValid) return Response.json({ error: "invalid_signature" }, { status: 403 });

  const event = parseTelnyxEventEnvelope(rawBody);
  if (!event) return Response.json({ error: "invalid_event" }, { status: 400 });

  logInfo({ event: "telnyx_webhook_verified", eventId: event.data.id, eventType: event.data.event_type });

  // Return a retryable response until webhook events can be persisted idempotently.
  // The Telnyx profile must not point here until this becomes a fast 2xx path.
  return Response.json({ error: "webhook_persistence_not_ready" }, { status: 503 });
}

function isDeliveryQueueMessage(value: unknown): value is DeliveryQueueMessage {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<DeliveryQueueMessage>;
  return candidate.kind === "sms_delivery" && typeof candidate.deliveryId === "string" && candidate.deliveryId.length > 0;
}

function isEnabled(value: string | undefined): boolean {
  return value === "true";
}

function logInfo(fields: Record<string, unknown>): void {
  console.log(JSON.stringify(fields));
}

function logError(fields: Record<string, unknown>): void {
  console.error(JSON.stringify(fields));
}
