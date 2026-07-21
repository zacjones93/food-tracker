import type { SendSmsInput, SendSmsResult, SmsProvider, SmsProviderError } from "./sms-provider";

const TELNYX_MESSAGES_URL = "https://api.telnyx.com/v2/messages";
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

interface CreateTelnyxSmsProviderInput {
  apiKey: string;
  fetcher?: typeof fetch;
  fromE164: string;
  messagingProfileId: string;
}

interface TelnyxApiError {
  code?: string;
  detail?: string;
  title?: string;
}

interface TelnyxMessageResponse {
  data?: {
    encoding?: string;
    id?: string;
    parts?: number;
    received_at?: string;
  };
  errors?: TelnyxApiError[];
}

export function createTelnyxSmsProvider({
  apiKey,
  fetcher = fetch,
  fromE164,
  messagingProfileId,
}: CreateTelnyxSmsProviderInput): SmsProvider {
  if (!apiKey) throw new Error("TELNYX_API_KEY is required");
  if (!E164_PATTERN.test(fromE164)) throw new Error("Telnyx sender must use E.164 format");
  if (!messagingProfileId) throw new Error("TELNYX_MESSAGING_PROFILE_ID is required");

  return {
    async send(input: SendSmsInput): Promise<SendSmsResult> {
      validateSendInput(input);

      const payload = {
        auto_detect: true,
        encoding: "auto",
        from: fromE164,
        messaging_profile_id: messagingProfileId,
        text: input.body,
        to: input.toE164,
        type: "SMS",
        use_profile_webhooks: false,
        ...(input.statusCallbackUrl
          ? { use_profile_webhooks: false, webhook_url: input.statusCallbackUrl }
          : {}),
      };

      const response = await fetcher(TELNYX_MESSAGES_URL, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
      const responseBody = await readResponseBody(response);

      if (!response.ok) throw createProviderError({ response, responseBody });

      const providerMessageId = responseBody.data?.id;
      if (!providerMessageId) {
        throw createProviderError({
          response: new Response(null, { status: 502 }),
          responseBody: { errors: [{ detail: "Telnyx response did not include a message ID" }] },
        });
      }

      return {
        acceptedAt: parseAcceptedAt(responseBody.data?.received_at),
        encoding: responseBody.data?.encoding,
        parts: responseBody.data?.parts,
        providerMessageId,
      };
    },
  };
}

function validateSendInput(input: SendSmsInput): void {
  if (!input.deliveryId) throw new Error("deliveryId is required");
  if (!E164_PATTERN.test(input.toE164)) throw new Error("SMS recipient must use E.164 format");
  if (!input.body.trim()) throw new Error("SMS body is required");
  if (input.statusCallbackUrl) validateStatusCallbackUrl(input.statusCallbackUrl);
}

function validateStatusCallbackUrl(value: string): void {
  const url = new URL(value);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";

  if (url.protocol !== "https:" || isLocalhost) {
    throw new Error("Telnyx status callback must use a public HTTPS URL");
  }
}

async function readResponseBody(response: Response): Promise<TelnyxMessageResponse> {
  try {
    return await response.json<TelnyxMessageResponse>();
  } catch {
    return {};
  }
}

function createProviderError({
  response,
  responseBody,
}: {
  response: Response;
  responseBody: TelnyxMessageResponse;
}): SmsProviderError {
  const firstError = responseBody.errors?.[0];
  const error = Object.assign(new Error(firstError?.detail ?? firstError?.title ?? "Telnyx request failed"), {
    name: "SmsProviderError",
    providerCode: firstError?.code,
    retryable: response.status === 429 || response.status >= 500,
    status: response.status,
  });

  return error;
}

function parseAcceptedAt(value: string | undefined): Date {
  if (!value) return new Date();

  const acceptedAt = new Date(value);
  return Number.isNaN(acceptedAt.getTime()) ? new Date() : acceptedAt;
}
