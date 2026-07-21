export interface AssistantRequestContext {
  userId: string;
  teamId: string;
  chatId: string;
  requestId: string;
  runId: string;
  maxOutputTokens: number;
}

const CONTEXT_HEADERS = {
  userId: "x-assistant-user-id",
  teamId: "x-assistant-team-id",
  chatId: "x-assistant-chat-id",
  requestId: "x-request-id",
  runId: "x-run-id",
  maxOutputTokens: "x-assistant-max-output-tokens",
} as const;

function readIdentifier(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim();
  if (!value || value.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(value)) {
    throw new AssistantWorkerError("INVALID_CONTEXT", "Invalid assistant context", 400);
  }
  return value;
}

export function parseAssistantRequestContext(request: Request): AssistantRequestContext {
  const maxOutputTokens = Number(request.headers.get(CONTEXT_HEADERS.maxOutputTokens));
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 16_384) {
    throw new AssistantWorkerError("INVALID_TOKEN_POLICY", "Invalid token policy", 400);
  }

  return {
    userId: readIdentifier(request.headers, CONTEXT_HEADERS.userId),
    teamId: readIdentifier(request.headers, CONTEXT_HEADERS.teamId),
    chatId: readIdentifier(request.headers, CONTEXT_HEADERS.chatId),
    requestId: readIdentifier(request.headers, CONTEXT_HEADERS.requestId),
    runId: readIdentifier(request.headers, CONTEXT_HEADERS.runId),
    maxOutputTokens,
  };
}

export class AssistantWorkerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AssistantWorkerError";
  }
}

export function assistantWorkerErrorResponse(error: unknown, requestId?: string): Response {
  const normalized = error instanceof AssistantWorkerError
    ? error
    : new AssistantWorkerError("INTERNAL_ERROR", "Internal server error", 500);

  return Response.json(
    { error: normalized.message, code: normalized.code, requestId },
    { status: normalized.status },
  );
}
