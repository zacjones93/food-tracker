export interface SendSmsInput {
  body: string;
  deliveryId: string;
  statusCallbackUrl?: string;
  toE164: string;
}

export interface SendSmsResult {
  acceptedAt: Date;
  encoding?: string;
  parts?: number;
  providerMessageId: string;
}

export interface SmsProvider {
  send(input: SendSmsInput): Promise<SendSmsResult>;
}

export interface SmsProviderError extends Error {
  providerCode?: string;
  retryable: boolean;
  status: number;
}

export function isSmsProviderError(error: unknown): error is SmsProviderError {
  if (!(error instanceof Error)) return false;

  const candidate = error as Partial<SmsProviderError>;
  return typeof candidate.status === "number" && typeof candidate.retryable === "boolean";
}
