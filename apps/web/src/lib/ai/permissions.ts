import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "./access-control";

export type AiErrorStatus = 401 | 403 | 409 | 422 | 429 | 500;

export interface AiRequestError extends Error {
  code: string;
  status: AiErrorStatus;
}

export function isChatOwnedBy({
  chat,
  userId,
  teamId,
}: {
  chat: { userId: string; teamId: string };
  userId: string;
  teamId: string;
}): boolean {
  return chat.userId === userId && chat.teamId === teamId;
}

export function createAiRequestError({
  code,
  message,
  status,
  cause,
}: {
  code: string;
  message: string;
  status: AiErrorStatus;
  cause?: unknown;
}): AiRequestError {
  const error = new Error(message, cause === undefined ? undefined : { cause }) as AiRequestError;
  error.name = "AiRequestError";
  error.code = code;
  error.status = status;
  return error;
}

export function isAiRequestError(error: unknown): error is AiRequestError {
  if (!(error instanceof Error)) return false;

  const candidate = error as Partial<AiRequestError>;
  return (
    candidate.name === "AiRequestError" &&
    typeof candidate.code === "string" &&
    [401, 403, 409, 422, 429, 500].includes(candidate.status ?? 0)
  );
}

export function aiErrorResponse({
  error,
  requestId,
  runId,
}: {
  error: unknown;
  requestId: string;
  runId: string;
}): Response {
  const requestError = isAiRequestError(error)
    ? error
    : createAiRequestError({
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        status: 500,
        cause: error,
      });

  return Response.json(
    {
      error: requestError.message,
      code: requestError.code,
      requestId,
      runId,
    },
    {
      status: requestError.status,
      headers: {
        "x-request-id": requestId,
        "x-run-id": runId,
      },
    },
  );
}

export async function requireAiAccess() {
  const session = await getSessionFromCookie();

  if (!session) {
    throw createAiRequestError({
      code: "AUTH_REQUIRED",
      message: "Unauthorized - please sign in",
      status: 401,
    });
  }

  if (!session.activeTeamId) {
    throw createAiRequestError({
      code: "ACTIVE_TEAM_REQUIRED",
      message: "No active team selected",
      status: 403,
    });
  }

  const accessCheck = await checkAiAccess(session.activeTeamId);

  if (!accessCheck.allowed) {
    throw createAiRequestError({
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
