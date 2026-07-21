import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "./access-control";

export type AiErrorStatus = 401 | 403 | 409 | 422 | 429 | 500;

export interface AiDomainError extends Error {
  code: string;
  status: AiErrorStatus;
}

export interface AiRequestContext {
  requestId: string;
  runId: string;
  userId?: string;
  teamId?: string;
  chatId?: string;
}

export interface AuthorizedAiRequestContext extends AiRequestContext {
  userId: string;
  teamId: string;
}

export function createAiRequestContext({
  requestId,
}: {
  requestId?: string | null;
} = {}): AiRequestContext {
  const candidate = requestId?.trim();
  const validatedRequestId =
    candidate && candidate.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(candidate)
      ? candidate
      : crypto.randomUUID();

  return {
    requestId: validatedRequestId,
    runId: crypto.randomUUID(),
  };
}

export function authorizeAiRequestContext({
  context,
  userId,
  teamId,
}: {
  context: AiRequestContext;
  userId: string;
  teamId: string;
}): AuthorizedAiRequestContext {
  return { ...context, userId, teamId };
}

export function withAiChatContext({
  context,
  chatId,
}: {
  context: AuthorizedAiRequestContext;
  chatId: string;
}): AuthorizedAiRequestContext {
  return { ...context, chatId };
}

export function logAiEvent({
  level,
  event,
  context,
  details,
}: {
  level: "info" | "warn" | "error";
  event: string;
  context: AiRequestContext;
  details?: Record<string, unknown>;
}): void {
  console[level](
    JSON.stringify({
      scope: "ai-assistant",
      event,
      requestId: context.requestId,
      runId: context.runId,
      ...(context.chatId ? { chatId: context.chatId } : {}),
      ...details,
    }),
  );
}

export function createAiDomainError({
  code,
  message,
  status,
  cause,
}: {
  code: string;
  message: string;
  status: AiErrorStatus;
  cause?: unknown;
}): AiDomainError {
  const error = new Error(
    message,
    cause === undefined ? undefined : { cause },
  ) as AiDomainError;
  error.name = "AiDomainError";
  error.code = code;
  error.status = status;
  return error;
}

export function isAiDomainError(error: unknown): error is AiDomainError {
  if (!(error instanceof Error)) return false;

  const candidate = error as Partial<AiDomainError>;
  return (
    candidate.name === "AiDomainError" &&
    typeof candidate.code === "string" &&
    [401, 403, 409, 422, 429, 500].includes(candidate.status ?? 0)
  );
}

export function aiErrorResponse({
  error,
  context,
}: {
  error: unknown;
  context: AiRequestContext;
}): Response {
  const requestError = isAiDomainError(error)
    ? error
    : createAiDomainError({
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        status: 500,
        cause: error,
      });

  return Response.json(
    {
      error: requestError.message,
      code: requestError.code,
      requestId: context.requestId,
      runId: context.runId,
    },
    {
      status: requestError.status,
      headers: {
        "x-request-id": context.requestId,
        "x-run-id": context.runId,
      },
    },
  );
}

export async function requireAiAccess() {
  const session = await getSessionFromCookie();

  if (!session) {
    throw createAiDomainError({
      code: "AUTH_REQUIRED",
      message: "Unauthorized - please sign in",
      status: 401,
    });
  }

  if (!session.activeTeamId) {
    throw createAiDomainError({
      code: "ACTIVE_TEAM_REQUIRED",
      message: "No active team selected",
      status: 403,
    });
  }

  const accessCheck = await checkAiAccess(session.activeTeamId);

  if (!accessCheck.allowed) {
    throw createAiDomainError({
      code: "AI_ACCESS_DENIED",
      message: accessCheck.reason ?? "AI access denied",
      status: 403,
    });
  }

  return {
    session,
    settings: accessCheck.settings!,
  };
}
