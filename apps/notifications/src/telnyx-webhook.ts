const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export interface TelnyxEventEnvelope {
  data: {
    event_type: string;
    id: string;
    occurred_at?: string;
    payload: unknown;
  };
}

interface VerifyTelnyxWebhookInput {
  nowMs?: number;
  publicKey: string;
  rawBody: string;
  signature: string;
  timestamp: string;
}

export async function verifyTelnyxWebhook({
  nowMs = Date.now(),
  publicKey,
  rawBody,
  signature,
  timestamp,
}: VerifyTelnyxWebhookInput): Promise<boolean> {
  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;

  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) return false;

  try {
    const verificationKey = await crypto.subtle.importKey(
      "raw",
      decodeBase64(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`);

    return await crypto.subtle.verify(
      { name: "Ed25519" },
      verificationKey,
      decodeBase64(signature),
      signedPayload,
    );
  } catch {
    return false;
  }
}

export function parseTelnyxEventEnvelope(rawBody: string): TelnyxEventEnvelope | null {
  try {
    const value: unknown = JSON.parse(rawBody);
    if (!isRecord(value) || !isRecord(value.data)) return null;
    if (typeof value.data.id !== "string" || typeof value.data.event_type !== "string") return null;

    return {
      data: {
        event_type: value.data.event_type,
        id: value.data.id,
        occurred_at: typeof value.data.occurred_at === "string" ? value.data.occurred_at : undefined,
        payload: value.data.payload,
      },
    };
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
