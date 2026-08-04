export interface PushAlert {
  body: string;
  title: string;
}

export interface SendPushInput {
  alert: PushAlert;
  apnsId?: string;
  collapseId?: string;
  deliveryId: string;
  destination?: string;
  deviceToken: string;
}

export interface SendPushResult {
  acceptedAt: Date;
  providerMessageId: string;
}

export interface PushProvider {
  send(input: SendPushInput): Promise<SendPushResult>;
}

export interface PushProviderError extends Error {
  invalidateDeviceToken: boolean;
  providerCode?: string;
  retryable: boolean;
  status: number;
}

export function isPushProviderError(error: unknown): error is PushProviderError {
  if (!(error instanceof Error)) return false;

  const candidate = error as Partial<PushProviderError>;
  return (
    typeof candidate.invalidateDeviceToken === "boolean" &&
    typeof candidate.retryable === "boolean" &&
    typeof candidate.status === "number"
  );
}
