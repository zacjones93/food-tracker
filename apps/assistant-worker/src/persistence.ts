import type { ChatMiddleware, TokenUsage, UIMessage } from "@tanstack/ai";

import type { AssistantRequestContext } from "./context";
import { sanitizeAssistantText } from "./assistant-text";
import { calculateEstimatedAiCostUsd } from "./ai-model";
import {
  getWorkerAssistantErrorMessage,
  type WorkerAssistantErrorCode,
} from "./errors";

interface RunOutcome {
  status: "completed" | "partial" | "error";
  errorCode?: WorkerAssistantErrorCode;
  finishReason: string | null;
}

const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function boundedJson(value: unknown, maxLength = 16_000): string {
  const json = JSON.stringify(value) ?? "null";
  return json.length <= maxLength ? json : JSON.stringify({ truncated: true });
}

export function summarizeToolInput(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null)
    return { kind: typeof value };
  const code =
    "typescriptCode" in value
      ? value.typescriptCode
      : "code" in value
        ? value.code
        : null;
  if (typeof code === "string") {
    return { kind: "code", codeLength: code.length };
  }
  return { kind: "object", keys: Object.keys(value).sort().slice(0, 20) };
}

export function didToolExecutionFail({
  toolName,
  ok,
  result,
}: {
  toolName: string;
  ok: boolean;
  result: unknown;
}): boolean {
  if (!ok) return true;
  return (
    toolName === "execute_typescript" &&
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    result.success === false
  );
}

export function summarizeToolOutput(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { kind: "array", itemCount: value.length };
  if (typeof value !== "object" || value === null)
    return { kind: typeof value };
  if ("result" in value) {
    const result = value.result;
    return {
      kind: "code-result",
      ...(Array.isArray(result) ? { itemCount: result.length } : {}),
      resultKind: Array.isArray(result) ? "array" : typeof result,
      logCount:
        "logs" in value && Array.isArray(value.logs) ? value.logs.length : 0,
    };
  }
  return { kind: "object", keys: Object.keys(value).sort().slice(0, 20) };
}

function partLegacyColumns(
  part: UIMessage["parts"][number],
): Record<string, unknown> {
  if (part.type === "text") return { textContent: part.content };
  if (part.type === "tool-call") {
    return {
      toolName: part.name,
      toolCallId: part.id,
      toolArgs: part.arguments,
      toolResult: part.output === undefined ? null : boundedJson(part.output),
      toolState: part.state,
    };
  }
  if (part.type === "tool-result") {
    return {
      toolCallId: part.toolCallId,
      toolResult: boundedJson(part.content),
      toolState: part.state,
    };
  }
  return {};
}

export async function assertAuthorizedChat({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Promise<void> {
  const chat = await db
    .prepare(
      "SELECT id FROM ai_chats WHERE id = ? AND userId = ? AND teamId = ? LIMIT 1",
    )
    .bind(context.chatId, context.userId, context.teamId)
    .first<{ id: string }>();
  if (!chat) throw new Error("Chat authorization failed");
}

export async function persistMessage({
  db,
  chatId,
  message,
}: {
  db: D1Database;
  chatId: string;
  message: UIMessage;
}): Promise<void> {
  if (message.parts.length === 0) return;
  const timestamp = nowSeconds();
  const statements: D1PreparedStatement[] = [
    db
      .prepare("DELETE FROM ai_message_parts WHERE messageId = ?")
      .bind(message.id),
    db.prepare("DELETE FROM ai_messages WHERE id = ?").bind(message.id),
    db
      .prepare(
        `INSERT INTO ai_messages
       (id, chatId, role, createdAt, updatedAt, updateCounter)
       VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .bind(message.id, chatId, message.role, timestamp, timestamp),
  ];

  message.parts.forEach((part, partOrder) => {
    const legacy = partLegacyColumns(part);
    statements.push(
      db
        .prepare(
          `INSERT INTO ai_message_parts
       (id, messageId, partOrder, partType, payloadJson, text_content,
        tool_name, tool_call_id, tool_args, tool_result, tool_state,
        createdAt, updatedAt, updateCounter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .bind(
          `aimp_${crypto.randomUUID()}`,
          message.id,
          partOrder,
          part.type,
          boundedJson(part),
          legacy.textContent ?? null,
          legacy.toolName ?? null,
          legacy.toolCallId ?? null,
          legacy.toolArgs ?? null,
          legacy.toolResult ?? null,
          legacy.toolState ?? null,
          timestamp,
          timestamp,
        ),
    );
  });

  await db.batch(statements);
}

export async function startRun({
  db,
  context,
  model,
  promptVersion,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  model: string;
  promptVersion: string;
}): Promise<void> {
  const timestamp = nowSeconds();
  await db
    .prepare(
      `INSERT INTO ai_runs
     (id, chatId, userId, teamId, model, promptVersion, status,
      createdAt, updatedAt, updateCounter)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, 0)`,
    )
    .bind(
      context.runId,
      context.chatId,
      context.userId,
      context.teamId,
      model,
      promptVersion,
      timestamp,
      timestamp,
    )
    .run();
}

async function finishRun({
  db,
  context,
  status,
  finishReason,
  errorCode,
  usage,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  status: "completed" | "partial" | "interrupted" | "aborted" | "error";
  finishReason?: string | null;
  errorCode?: string;
  usage?: unknown;
}): Promise<void> {
  await db
    .prepare(
      `UPDATE ai_runs
        SET status = ?, finishReason = ?, errorCode = ?, usageJson = ?,
            updatedAt = ?, updateCounter = updateCounter + 1
      WHERE id = ? AND userId = ? AND teamId = ?`,
    )
    .bind(
      status,
      finishReason ?? null,
      errorCode ?? null,
      usage === undefined ? null : boundedJson(usage),
      nowSeconds(),
      context.runId,
      context.userId,
      context.teamId,
    )
    .run();
}

function addUsage(total: TokenUsage | null, usage: TokenUsage): TokenUsage {
  if (!total) return usage;
  const hasReportedCost = total.cost !== undefined || usage.cost !== undefined;
  return {
    promptTokens: total.promptTokens + usage.promptTokens,
    completionTokens: total.completionTokens + usage.completionTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
    promptTokensDetails: {
      cachedTokens:
        (total.promptTokensDetails?.cachedTokens ?? 0) +
        (usage.promptTokensDetails?.cachedTokens ?? 0),
    },
    completionTokensDetails: {
      reasoningTokens:
        (total.completionTokensDetails?.reasoningTokens ?? 0) +
        (usage.completionTokensDetails?.reasoningTokens ?? 0),
    },
    ...(hasReportedCost ? { cost: (total.cost ?? 0) + (usage.cost ?? 0) } : {}),
  };
}

async function persistUsage({
  db,
  context,
  model,
  usage,
  finishReason,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  model: string;
  usage: TokenUsage;
  finishReason?: string | null;
}): Promise<void> {
  const timestamp = nowSeconds();
  const estimatedCostUsd = calculateEstimatedAiCostUsd({ model, usage });
  await db
    .prepare(
      `INSERT INTO ai_usage
     (id, userId, teamId, model, endpoint, inputTokens, outputTokens,
      reasoningTokens, cachedInputTokens, totalTokens, estimatedCostUsd,
      conversationId, finishReason, createdAt, updatedAt, updateCounter)
     VALUES (?, ?, ?, ?, '/api/assistant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      `aiu_${crypto.randomUUID()}`,
      context.userId,
      context.teamId,
      model,
      usage.promptTokens,
      usage.completionTokens,
      usage.completionTokensDetails?.reasoningTokens ?? 0,
      usage.promptTokensDetails?.cachedTokens ?? 0,
      usage.totalTokens,
      String(estimatedCostUsd),
      context.chatId,
      finishReason ?? null,
      timestamp,
      timestamp,
    )
    .run();
}

export function classifyRunOutcome({
  content,
  failedToolCalls,
  successfulToolCalls,
  finishReason,
}: {
  content: string;
  failedToolCalls: number;
  successfulToolCalls: number;
  finishReason: string | null;
}): RunOutcome {
  const hasContent = content.trim().length > 0;
  if (failedToolCalls > 0 && (!hasContent || successfulToolCalls === 0)) {
    return {
      status: "error",
      errorCode: "CODE_MODE_NO_ANSWER",
      finishReason: "tool-error",
    };
  }
  if (failedToolCalls > 0) {
    return {
      status: "partial",
      errorCode: "TOOL_FAILURE_PARTIAL",
      finishReason: "partial",
    };
  }
  if (!hasContent) {
    return {
      status: "error",
      errorCode: "EMPTY_RESPONSE",
      finishReason: "empty-response",
    };
  }
  return { status: "completed", finishReason };
}

export function createPersistenceMiddleware({
  db,
  context,
  model,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  model: string;
}): ChatMiddleware {
  const toolInputs = new Map<string, unknown>();
  const approvalRequiredToolCalls = new Set<string>();
  let failedToolCalls = 0;
  let successfulToolCalls = 0;
  let observedUsage: TokenUsage | null = null;

  return {
    name: "food-tracker-persistence",
    onBeforeToolCall(_middlewareContext, hookContext) {
      toolInputs.set(hookContext.toolCallId, hookContext.args);
      if (hookContext.tool?.needsApproval === true) {
        approvalRequiredToolCalls.add(hookContext.toolCallId);
      }
    },
    async onAfterToolCall(_middlewareContext, info) {
      const didFail = didToolExecutionFail({
        toolName: info.toolName,
        ok: info.ok,
        result: info.ok ? info.result : undefined,
      });
      if (didFail) failedToolCalls += 1;
      else successfulToolCalls += 1;
      const [namespace = "codemode", toolName = info.toolName] =
        info.toolName.split(".", 2);
      const wasApproved = approvalRequiredToolCalls.has(info.toolCallId);
      const timestamp = nowSeconds();
      await db
        .prepare(
          `INSERT INTO ai_tool_executions
         (id, runId, namespace, toolName, status, inputSummaryJson,
          outputSummaryJson, durationMs, approvalState, writeOccurred,
          createdAt, updatedAt, updateCounter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .bind(
          `aitx_${crypto.randomUUID()}`,
          context.runId,
          namespace,
          toolName,
          didFail ? "error" : "completed",
          boundedJson(summarizeToolInput(toolInputs.get(info.toolCallId))),
          boundedJson(
            didFail
              ? { error: "Tool execution failed" }
              : summarizeToolOutput(info.result),
          ),
          Math.max(0, Math.round(info.duration)),
          wasApproved ? "approved" : "not-required",
          wasApproved && !didFail ? 1 : 0,
          timestamp,
          timestamp,
        )
        .run();
    },
    async onToolPhaseComplete(_middlewareContext, info) {
      if (
        info.needsApproval.length === 0 &&
        info.needsClientExecution.length === 0
      ) return;
      const finishReason = info.needsApproval.length > 0
        ? "approval-required"
        : "client-tool-required";
      const usage = observedUsage ?? EMPTY_USAGE;
      await finishRun({
        db,
        context,
        status: "interrupted",
        finishReason,
        usage,
      });
      await persistUsage({
        db,
        context,
        model,
        usage,
        finishReason,
      });
    },
    onUsage(_middlewareContext, usage) {
      observedUsage = addUsage(observedUsage, usage);
    },
    async onFinish(_middlewareContext, info) {
      const safeContent = sanitizeAssistantText(info.content);
      const outcome = classifyRunOutcome({
        content: safeContent,
        failedToolCalls,
        successfulToolCalls,
        finishReason: info.finishReason,
      });
      const persistedContent =
        outcome.status === "error"
          ? getWorkerAssistantErrorMessage(
              outcome.errorCode ?? "EMPTY_RESPONSE",
            )
          : safeContent;
      if (persistedContent) {
        await persistMessage({
          db,
          chatId: context.chatId,
          message: {
            id: `${context.runId}-assistant`,
            role: "assistant",
            parts: [{ type: "text", content: persistedContent }],
          },
        });
      }
      const usage = info.usage ?? observedUsage ?? EMPTY_USAGE;
      await finishRun({
        db,
        context,
        status: outcome.status,
        finishReason: outcome.finishReason,
        errorCode: outcome.errorCode,
        usage,
      });
      await persistUsage({
        db,
        context,
        model,
        usage,
        finishReason: outcome.finishReason,
      });
    },
    async onAbort(_middlewareContext, info) {
      const usage = observedUsage ?? EMPTY_USAGE;
      await finishRun({
        db,
        context,
        status: "aborted",
        errorCode: info.reason ? "ABORTED" : undefined,
        usage,
      });
      await persistUsage({
        db,
        context,
        model,
        usage,
        finishReason: "aborted",
      });
    },
    async onError() {
      const usage = observedUsage ?? EMPTY_USAGE;
      await finishRun({
        db,
        context,
        status: "error",
        finishReason: "error",
        errorCode: "MODEL_ERROR",
        usage,
      });
      await persistUsage({ db, context, model, usage, finishReason: "error" });
    },
  };
}
