import { createApnsPushProvider } from "./apns";
import { createD1DeliveryRepository } from "./d1-delivery-repository";
import { processPushDelivery, type ApnsEnvironment } from "./delivery";
import type { PushProvider } from "./push-provider";

const MAX_TEST_REQUEST_BYTES = 16 * 1024;
const RETRY_DELAY_SECONDS = 60;

interface DeliveryQueueMessage {
  deliveryId: string;
  environment: ApnsEnvironment;
  kind: "push_delivery";
}

interface ApnsConfiguration {
  bundleId: string;
  environment: ApnsEnvironment;
  keyId: string;
  privateKey: string;
  teamId: string;
}

interface ApnsRuntime {
  configuration: ApnsConfiguration;
  provider: PushProvider;
}

interface TestPushRequest {
  deliveryId: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest({ env, request });
  },

  async queue(batch: MessageBatch<DeliveryQueueMessage>, env: Env): Promise<void> {
    const repository = createD1DeliveryRepository(env.DB);
    let apnsRuntime: ApnsRuntime | undefined;
    for (const message of batch.messages) {
      if (!isDeliveryQueueMessage(message.body)) {
        logError({ event: "notification_queue_invalid_message", messageId: message.id });
        message.ack();
        continue;
      }

      if (!isEnabled(env.NOTIFICATIONS_ENABLED) || !isEnabled(env.PUSH_ENABLED)) {
        await repository.markSuppressed({
          deliveryId: message.body.deliveryId,
          reason: "kill_switch",
          suppressedAt: Math.floor(Date.now() / 1_000),
        });
        logInfo({
          deliveryId: message.body.deliveryId,
          event: "notification_delivery_suppressed",
          reason: "kill_switch",
        });
        message.ack();
        continue;
      }

      try {
        if (!apnsRuntime) {
          const configuration = getApnsConfiguration(env);
          apnsRuntime = {
            configuration,
            provider: createApnsPushProvider(configuration),
          };
        }
        const { configuration, provider } = apnsRuntime;
        if (message.body.environment !== configuration.environment) {
          await repository.markSuppressed({
            deliveryId: message.body.deliveryId,
            reason: "environment_mismatch",
            suppressedAt: Math.floor(Date.now() / 1_000),
          });
          logError({
            deliveryId: message.body.deliveryId,
            event: "notification_delivery_suppressed",
            reason: "environment_mismatch",
          });
          message.ack();
          continue;
        }

        const result = await processPushDelivery({
          bundleId: configuration.bundleId,
          deliveryId: message.body.deliveryId,
          environment: configuration.environment,
          provider,
          repository,
        });
        if (result === "retry") {
          message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
          continue;
        }
        message.ack();
      } catch {
        logError({
          deliveryId: message.body.deliveryId,
          event: "notification_delivery_failed",
          reason: "configuration_or_persistence_error",
        });
        message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
      }
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
  if (request.method === "POST" && url.pathname === "/internal/test-push") {
    return handleTestPush({ env, request });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

function healthResponse(env: Env): Response {
  const notificationsEnabled = isEnabled(env.NOTIFICATIONS_ENABLED);
  const pushEnabled = isEnabled(env.PUSH_ENABLED);
  const providerConfigured = hasApnsConfiguration(env);
  const deliveryReady = notificationsEnabled && pushEnabled && providerConfigured;

  return Response.json({
    checks: {
      apnsConfigured: providerConfigured,
      canonicalUrlConfigured: env.PUBLIC_APP_URL === "https://listtoladle.com",
      d1Bound: Boolean(env.DB),
      deliveryQueueBound: Boolean(env.DELIVERY_QUEUE),
    },
    deliveryPipelineReady: true,
    deliveryReady,
    eventGenerationReady: false,
    notificationsEnabled,
    providerReady: providerConfigured,
    pushEnabled,
    ready: false,
    status: notificationsEnabled || pushEnabled ? "blocked" : "disabled",
  });
}

async function handleTestPush({ env, request }: { env: Env; request: Request }): Promise<Response> {
  if (!isEnabled(env.PUSH_TEST_ENABLED)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!env.PUSH_TEST_TOKEN || !hasValidBearerToken({ request, token: env.PUSH_TEST_TOKEN })) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isEnabled(env.NOTIFICATIONS_ENABLED) || !isEnabled(env.PUSH_ENABLED)) {
    return Response.json({ error: "push_disabled" }, { status: 503 });
  }
  if (env.APNS_ENVIRONMENT !== "sandbox") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_TEST_REQUEST_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_TEST_REQUEST_BYTES) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }
    const input = parseTestPushRequest(rawBody);
    const configuration = getApnsConfiguration(env);
    const result = await processPushDelivery({
      bundleId: configuration.bundleId,
      deliveryId: input.deliveryId,
      environment: configuration.environment,
      provider: createApnsPushProvider(configuration),
      repository: createD1DeliveryRepository(env.DB),
    });

    return Response.json({ result }, { status: result === "complete" ? 202 : 503 });
  } catch (error) {
    logError({ event: "notification_test_push_failed", reason: "invalid_request_or_configuration" });
    return Response.json({ error: "invalid_request_or_configuration" }, { status: 400 });
  }
}

function parseTestPushRequest(rawBody: string): TestPushRequest {
  const value = JSON.parse(rawBody) as Partial<TestPushRequest>;
  if (typeof value.deliveryId !== "string" || !value.deliveryId.trim()) {
    throw new Error("Invalid test push request");
  }

  return { deliveryId: value.deliveryId };
}

function hasValidBearerToken({ request, token }: { request: Request; token: string }): boolean {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const suppliedBytes = new TextEncoder().encode(supplied);
  const expectedBytes = new TextEncoder().encode(token);
  if (suppliedBytes.byteLength !== expectedBytes.byteLength) return false;

  let difference = 0;
  for (let index = 0; index < suppliedBytes.byteLength; index += 1) {
    difference |= suppliedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

function isDeliveryQueueMessage(value: unknown): value is DeliveryQueueMessage {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<DeliveryQueueMessage>;
  return (
    candidate.kind === "push_delivery" &&
    typeof candidate.deliveryId === "string" &&
    candidate.deliveryId.length > 0 &&
    (candidate.environment === "production" || candidate.environment === "sandbox")
  );
}

function getApnsConfiguration(env: Env): ApnsConfiguration {
  const bundleId = env.APNS_BUNDLE_ID;
  const environment = String(env.APNS_ENVIRONMENT ?? "");
  const keyId = env.APNS_KEY_ID;
  const privateKey = env.APNS_PRIVATE_KEY;
  const teamId = env.APNS_TEAM_ID;
  if (
    !bundleId ||
    (environment !== "production" && environment !== "sandbox") ||
    !keyId ||
    !privateKey ||
    !teamId
  ) {
    throw new Error("APNs is not configured for an explicit environment");
  }
  return { bundleId, environment, keyId, privateKey, teamId };
}

function hasApnsConfiguration(env: Env): boolean {
  try {
    getApnsConfiguration(env);
    return true;
  } catch {
    return false;
  }
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
