import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDB } from "@/db";
import {
  checkDailyUsageLimit,
  checkMonthlyBudgetLimit,
  resolveMaxOutputTokens,
} from "@/lib/ai/access-control";
import { getOrCreateChat } from "@/lib/ai/chat-actions";
import { resolveAssistantPageContext } from "@/lib/ai/resolve-assistant-context";
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
    resolvedPageContext?: unknown;
  };
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
      resolveAssistantPageContext({
        context: body.forwardedProps?.pageContext,
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
    const { env } = await getCloudflareContext({ async: true });
    const forwardedProps = { ...body.forwardedProps };
    delete forwardedProps.pageContext;
    const assistantBody: AssistantWireBody = {
      ...body,
      forwardedProps: {
        ...forwardedProps,
        chatId,
        resolvedPageContext,
      },
    };
    const response = await env.ASSISTANT.fetch(new Request("https://assistant.internal/v1/chat", {
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
      signal: request.signal,
    }));
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
