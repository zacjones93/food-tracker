import type {
  PushProvider,
  PushProviderError,
  SendPushInput,
  SendPushResult,
} from "./push-provider";

const APNS_PAYLOAD_LIMIT_BYTES = 4_096;
const APNS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_TOKEN_PATTERN = /^(?:[0-9a-f]{2})+$/i;
const PROVIDER_TOKEN_MAX_AGE_MS = 50 * 60 * 1_000;

interface CreateApnsPushProviderInput {
  bundleId: string;
  createId?: () => string;
  cryptoProvider?: Crypto;
  environment: "production" | "sandbox";
  fetcher?: typeof fetch;
  keyId: string;
  now?: () => Date;
  privateKey: string;
  teamId: string;
}

interface ApnsErrorBody {
  reason?: string;
  timestamp?: number;
}

interface CachedProviderToken {
  createdAt: number;
  value: string;
}

export function createApnsPushProvider({
  bundleId,
  createId = () => crypto.randomUUID(),
  cryptoProvider = crypto,
  environment,
  fetcher = fetch,
  keyId,
  now = () => new Date(),
  privateKey,
  teamId,
}: CreateApnsPushProviderInput): PushProvider {
  validateConfiguration({ bundleId, keyId, privateKey, teamId });
  let cachedProviderToken: CachedProviderToken | undefined;

  return {
    async send(input: SendPushInput): Promise<SendPushResult> {
      validateSendInput(input);
      const payload = createPayload(input);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
      if (payloadBytes.byteLength > APNS_PAYLOAD_LIMIT_BYTES) {
        throw new Error(`APNs payload exceeds ${APNS_PAYLOAD_LIMIT_BYTES} bytes`);
      }

      const currentTime = now();
      if (
        !cachedProviderToken ||
        currentTime.getTime() - cachedProviderToken.createdAt >= PROVIDER_TOKEN_MAX_AGE_MS
      ) {
        cachedProviderToken = {
          createdAt: currentTime.getTime(),
          value: await createProviderToken({
            cryptoProvider,
            issuedAt: Math.floor(currentTime.getTime() / 1_000),
            keyId,
            privateKey,
            teamId,
          }),
        };
      }

      const apnsId = input.apnsId ?? createId();
      const hostname =
        environment === "production"
          ? "api.push.apple.com"
          : "api.sandbox.push.apple.com";
      const response = await fetcher(
        `https://${hostname}/3/device/${encodeURIComponent(input.deviceToken)}`,
        {
          body: payloadBytes,
          headers: {
            authorization: `bearer ${cachedProviderToken.value}`,
            "apns-expiration": "0",
            "apns-id": apnsId,
            "apns-priority": "10",
            "apns-push-type": "alert",
            "apns-topic": bundleId,
            "content-type": "application/json",
            ...(input.collapseId ? { "apns-collapse-id": input.collapseId } : {}),
          },
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        const responseBody = await readErrorBody(response);
        throw createProviderError({ response, responseBody });
      }

      return {
        acceptedAt: currentTime,
        providerMessageId: response.headers.get("apns-id") ?? apnsId,
      };
    },
  };
}

async function createProviderToken({
  cryptoProvider,
  issuedAt,
  keyId,
  privateKey,
  teamId,
}: {
  cryptoProvider: Crypto;
  issuedAt: number;
  keyId: string;
  privateKey: string;
  teamId: string;
}): Promise<string> {
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: keyId })),
  );
  const claims = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ iat: issuedAt, iss: teamId })),
  );
  const unsignedToken = `${header}.${claims}`;
  const signingKey = await cryptoProvider.subtle.importKey(
    "pkcs8",
    decodePrivateKey(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await cryptoProvider.subtle.sign(
    { hash: "SHA-256", name: "ECDSA" },
    signingKey,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function createPayload(input: SendPushInput) {
  return {
    aps: {
      alert: input.alert,
      sound: "default",
    },
    deliveryId: input.deliveryId,
    ...(input.destination ? { destination: input.destination } : {}),
  };
}

function validateConfiguration({
  bundleId,
  keyId,
  privateKey,
  teamId,
}: {
  bundleId: string;
  keyId: string;
  privateKey: string;
  teamId: string;
}): void {
  if (!bundleId.trim()) throw new Error("APNS_BUNDLE_ID is required");
  if (!keyId.trim()) throw new Error("APNS_KEY_ID is required");
  if (!teamId.trim()) throw new Error("APNS_TEAM_ID is required");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("APNS_PRIVATE_KEY must be a PKCS#8 PEM key");
  }
}

function validateSendInput(input: SendPushInput): void {
  if (!input.deliveryId.trim()) throw new Error("deliveryId is required");
  if (!DEVICE_TOKEN_PATTERN.test(input.deviceToken)) {
    throw new Error("APNs device token must be an even-length hexadecimal string");
  }
  if (!input.alert.title.trim()) throw new Error("Push title is required");
  if (!input.alert.body.trim()) throw new Error("Push body is required");
  if (input.apnsId && !APNS_ID_PATTERN.test(input.apnsId)) {
    throw new Error("APNs ID must be a UUID");
  }
  if (input.destination && !input.destination.startsWith("/")) {
    throw new Error("Push destination must be a relative application path");
  }
  if (
    input.collapseId &&
    new TextEncoder().encode(input.collapseId).byteLength > 64
  ) {
    throw new Error("APNs collapse ID must be 64 bytes or fewer");
  }
}

function decodePrivateKey(privateKey: string): ArrayBuffer {
  const encoded = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function readErrorBody(response: Response): Promise<ApnsErrorBody> {
  try {
    return await response.json<ApnsErrorBody>();
  } catch {
    return {};
  }
}

function createProviderError({
  response,
  responseBody,
}: {
  response: Response;
  responseBody: ApnsErrorBody;
}): PushProviderError {
  const reason = responseBody.reason ?? "APNs request failed";
  const invalidateDeviceToken =
    response.status === 410 ||
    reason === "BadDeviceToken" ||
    reason === "DeviceTokenNotForTopic" ||
    reason === "Unregistered";

  return Object.assign(new Error(reason), {
    invalidateDeviceToken,
    name: "PushProviderError",
    providerCode: responseBody.reason,
    retryable: response.status === 429 || response.status >= 500,
    status: response.status,
  });
}
