import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq } from "drizzle-orm";

import { getDB } from "@/db";
import { aiRunsTable } from "@/db/schema";
import {
  checkDailyUsageLimit,
  checkMonthlyBudgetLimit,
  getAuthorizedChat,
  isChatOwnedBy,
  resolveMaxOutputTokens,
} from "@/lib/ai/access-control";
import { getChat, getOrCreateChat } from "@/lib/ai/chat-actions";
import { resolveAssistantContexts } from "@/lib/ai/resolve-assistant-context";
import {
  aiErrorResponse,
  authorizeAiRequestContext,
  createAiDomainError,
  createAiRequestContext,
  logAiEvent,
  requireAiAccess,
  withAiChatContext,
} from "@/lib/ai/permissions";

interface AssistantWireBody {
  threadId?: unknown;
  runId?: unknown;
  messages?: unknown;
  forwardedProps?: {
    chatId?: unknown;
    pageContext?: unknown;
    mentionedContexts?: unknown;
    resolvedPageContext?: unknown;
  };
}

interface AssistantStreamBody {
  chatId?: unknown;
  knownRunIds?: unknown;
  closeOnTerminal?: unknown;
  replayRunId?: unknown;
  replayLatestInterrupted?: unknown;
}

const LOCAL_ASSISTANT_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function resolveLocalAssistantUrl({ path }: { path: string }): URL | null {
  const localBaseUrl = process.env.ASSISTANT_LOCAL_URL?.trim();
  if (process.env.NODE_ENV !== "development" || !localBaseUrl) return null;

  const url = new URL(path, `${localBaseUrl.replace(/\/+$/u, "")}/`);
  if (url.protocol !== "http:" || !LOCAL_ASSISTANT_HOSTS.has(url.hostname)) {
    throw new TypeError("ASSISTANT_LOCAL_URL must use HTTP on a loopback host");
  }
  return url;
}

async function fetchAssistantService({
  path,
  init,
}: {
  path: string;
  init: RequestInit;
}): Promise<Response> {
  const localUrl = resolveLocalAssistantUrl({ path });
  const request = new Request(localUrl ?? `https://assistant.internal${path}`, init);
  if (localUrl) return fetch(request);

  const { env } = await getCloudflareContext({ async: true });
  return env.ASSISTANT.fetch(request);
}

function requiredIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw createAiDomainError({
      code: "INVALID_ASSISTANT_REQUEST",
      message: `${field} is required`,
      status: 422,
    });
  }
  return value.trim();
}

export async function handleAssistantRequest(request: Request): Promise<Response> {
  let requestContext = createAiRequestContext({ requestId: request.headers.get("x-request-id") });
  try {
    const { session, settings } = await requireAiAccess();
    const teamId = session.activeTeamId!;
    const authorizedContext = authorizeAiRequestContext({
      context: requestContext,
      userId: session.user.id,
      teamId,
    });
    const body = await request.json() as AssistantWireBody;
    const chatId = requiredIdentifier(body.forwardedProps?.chatId ?? body.threadId, "chatId");
    const runId = requiredIdentifier(body.runId, "runId");
    if (body.threadId !== chatId || !Array.isArray(body.messages)) {
      throw createAiDomainError({
        code: "INVALID_ASSISTANT_REQUEST",
        message: "Invalid assistant request",
        status: 422,
      });
    }
    requestContext = { ...withAiChatContext({ context: authorizedContext, chatId }), runId };

    const db = getDB();
    const [dailyUsage, monthlyBudget, resolvedPageContext] = await Promise.all([
      checkDailyUsageLimit({ teamId, maxRequests: settings.maxRequestsPerDay }),
      checkMonthlyBudgetLimit({ teamId, monthlyBudgetUsd: settings.monthlyBudgetUsd }),
      resolveAssistantContexts({
        pageContext: body.forwardedProps?.pageContext,
        mentionedContexts: body.forwardedProps?.mentionedContexts,
        db,
        teamId,
        userId: session.user.id,
      }),
    ]);
    if (!dailyUsage.withinLimit) {
      throw createAiDomainError({
        code: "DAILY_LIMIT_REACHED",
        message: "Daily AI request limit reached",
        status: 429,
      });
    }
    if (!monthlyBudget.withinLimit) {
      throw createAiDomainError({
        code: "MONTHLY_BUDGET_REACHED",
        message: "Monthly AI budget reached",
        status: 429,
      });
    }
    const maxOutputTokens = resolveMaxOutputTokens({
      maxTokensPerRequest: settings.maxTokensPerRequest,
    });
    if (!maxOutputTokens) {
      throw createAiDomainError({
        code: "INVALID_TOKEN_POLICY",
        message: "AI token policy is invalid",
        status: 500,
      });
    }

    await getOrCreateChat({ chatId, userId: session.user.id, teamId });
    const forwardedProps = { ...body.forwardedProps };
    delete forwardedProps.pageContext;
    delete forwardedProps.mentionedContexts;
    const assistantBody: AssistantWireBody = {
      ...body,
      forwardedProps: {
        ...forwardedProps,
        chatId,
        resolvedPageContext,
      },
    };
    const response = await fetchAssistantService({
      path: "/v1/chat",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-assistant-user-id": session.user.id,
          "x-assistant-team-id": teamId,
          "x-assistant-chat-id": chatId,
          "x-assistant-max-output-tokens": String(maxOutputTokens),
          "x-request-id": requestContext.requestId,
          "x-run-id": runId,
        },
        body: JSON.stringify(assistantBody),
      },
    });
    logAiEvent({
      level: response.ok ? "info" : "warn",
      event: "service.responded",
      context: requestContext,
      details: { status: response.status },
    });
    return response;
  } catch (error) {
    logAiEvent({
      level: "error",
      event: "request.failed",
      context: requestContext,
      details: { errorName: error instanceof Error ? error.name : "UnknownError" },
    });
    return aiErrorResponse({ error, context: requestContext });
  }
}

export async function handleAssistantStreamRequest(request: Request): Promise<Response> {
  let requestContext = createAiRequestContext({ requestId: request.headers.get("x-request-id") });
  try {
    const { session } = await requireAiAccess();
    const teamId = session.activeTeamId!;
    const body = await request.json() as AssistantStreamBody;
    const chatId = requiredIdentifier(body.chatId, "chatId");
    requestContext = withAiChatContext({
      context: authorizeAiRequestContext({
        context: requestContext,
        userId: session.user.id,
        teamId,
      }),
      chatId,
    });
    const chat = await getChat(chatId);
    if (!chat) return new Response(null, { status: 204 });
    if (!isChatOwnedBy({ chat, userId: session.user.id, teamId })) {
      throw createAiDomainError({
        code: "CHAT_FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    const knownRunIds = Array.isArray(body.knownRunIds)
      ? body.knownRunIds.filter((value): value is string =>
        typeof value === "string" && value.length <= 128)
      : [];
    let replayRunId = typeof body.replayRunId === "string" ? body.replayRunId : null;
    if (!replayRunId && body.replayLatestInterrupted === true) {
      const interruptedRun = await getDB().query.aiRunsTable.findFirst({
        where: and(
          eq(aiRunsTable.chatId, chatId),
          eq(aiRunsTable.userId, session.user.id),
          eq(aiRunsTable.teamId, teamId),
          eq(aiRunsTable.status, "interrupted"),
          eq(aiRunsTable.finishReason, "approval-required"),
        ),
        columns: { id: true },
        orderBy: [desc(aiRunsTable.createdAt)],
      });
      replayRunId = interruptedRun?.id ?? null;
    }
    const runId = `subscription_${crypto.randomUUID()}`;
    return await fetchAssistantService({
      path: "/v1/chat/events",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-assistant-user-id": session.user.id,
          "x-assistant-team-id": teamId,
          "x-assistant-chat-id": chatId,
          "x-assistant-max-output-tokens": "1",
          "x-request-id": requestContext.requestId,
          "x-run-id": runId,
        },
        body: JSON.stringify({
          knownRunIds,
          closeOnTerminal: body.closeOnTerminal === true,
          replayRunId,
        }),
      },
    });
  } catch (error) {
    return aiErrorResponse({ error, context: requestContext });
  }
}

export async function handleAssistantCancelRequest(request: Request): Promise<Response> {
  let requestContext = createAiRequestContext({ requestId: request.headers.get("x-request-id") });
  try {
    const { session } = await requireAiAccess();
    const teamId = session.activeTeamId!;
    const body = await request.json() as { chatId?: unknown; runId?: unknown };
    const chatId = requiredIdentifier(body.chatId, "chatId");
    const runId = requiredIdentifier(body.runId, "runId");
    requestContext = {
      ...withAiChatContext({
        context: authorizeAiRequestContext({
          context: requestContext,
          userId: session.user.id,
          teamId,
        }),
        chatId,
      }),
      runId,
    };
    const chat = await getAuthorizedChat({
      chatId,
      userId: session.user.id,
      teamId,
    });
    if (!chat) {
      throw createAiDomainError({
        code: "CHAT_FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    return await fetchAssistantService({
      path: "/v1/chat/cancel",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-assistant-user-id": session.user.id,
          "x-assistant-team-id": teamId,
          "x-assistant-chat-id": chatId,
          "x-assistant-max-output-tokens": "1",
          "x-request-id": requestContext.requestId,
          "x-run-id": runId,
        },
        body: "{}",
      },
    });
  } catch (error) {
    return aiErrorResponse({ error, context: requestContext });
  }
}
