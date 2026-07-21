import type { ChatMiddleware, UIMessage } from "@tanstack/ai";

import type { AssistantRequestContext } from "./context";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function boundedJson(value: unknown, maxLength = 16_000): string {
  const json = JSON.stringify(value) ?? "null";
  return json.length <= maxLength ? json : JSON.stringify({ truncated: true });
}

function partLegacyColumns(part: UIMessage["parts"][number]): Record<string, unknown> {
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
  const chat = await db.prepare(
    "SELECT id FROM ai_chats WHERE id = ? AND userId = ? AND teamId = ? LIMIT 1",
  ).bind(context.chatId, context.userId, context.teamId).first<{ id: string }>();
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
    db.prepare("DELETE FROM ai_message_parts WHERE messageId = ?").bind(message.id),
    db.prepare("DELETE FROM ai_messages WHERE id = ?").bind(message.id),
    db.prepare(
      `INSERT INTO ai_messages
       (id, chatId, role, createdAt, updatedAt, updateCounter)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).bind(message.id, chatId, message.role, timestamp, timestamp),
  ];

  message.parts.forEach((part, partOrder) => {
    const legacy = partLegacyColumns(part);
    statements.push(db.prepare(
      `INSERT INTO ai_message_parts
       (id, messageId, partOrder, partType, payloadJson, text_content,
        tool_name, tool_call_id, tool_args, tool_result, tool_state,
        createdAt, updatedAt, updateCounter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(
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
    ));
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
  await db.prepare(
    `INSERT INTO ai_runs
     (id, chatId, userId, teamId, model, promptVersion, status,
      createdAt, updatedAt, updateCounter)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, 0)`,
  ).bind(
    context.runId,
    context.chatId,
    context.userId,
    context.teamId,
    model,
    promptVersion,
    timestamp,
    timestamp,
  ).run();
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
  status: "completed" | "aborted" | "error";
  finishReason?: string | null;
  errorCode?: string;
  usage?: unknown;
}): Promise<void> {
  await db.prepare(
    `UPDATE ai_runs
        SET status = ?, finishReason = ?, errorCode = ?, usageJson = ?,
            updatedAt = ?, updateCounter = updateCounter + 1
      WHERE id = ? AND userId = ? AND teamId = ?`,
  ).bind(
    status,
    finishReason ?? null,
    errorCode ?? null,
    usage === undefined ? null : boundedJson(usage),
    nowSeconds(),
    context.runId,
    context.userId,
    context.teamId,
  ).run();
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

  return {
    name: "food-tracker-persistence",
    onBeforeToolCall(_middlewareContext, hookContext) {
      toolInputs.set(hookContext.toolCallId, hookContext.args);
    },
    async onAfterToolCall(_middlewareContext, info) {
      const [namespace = "codemode", toolName = info.toolName] = info.toolName.split(".", 2);
      const timestamp = nowSeconds();
      await db.prepare(
        `INSERT INTO ai_tool_executions
         (id, runId, namespace, toolName, status, inputSummaryJson,
          outputSummaryJson, durationMs, approvalState, writeOccurred,
          createdAt, updatedAt, updateCounter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not-required', 0, ?, ?, 0)`,
      ).bind(
        `aitx_${crypto.randomUUID()}`,
        context.runId,
        namespace,
        toolName,
        info.ok ? "completed" : "error",
        boundedJson(toolInputs.get(info.toolCallId)),
        boundedJson(info.ok ? info.result : { error: "Tool execution failed" }),
        Math.max(0, Math.round(info.duration)),
        timestamp,
        timestamp,
      ).run();
    },
    async onFinish(_middlewareContext, info) {
      if (info.content) {
        await persistMessage({
          db,
          chatId: context.chatId,
          message: {
            id: `${context.runId}-assistant`,
            role: "assistant",
            parts: [{ type: "text", content: info.content }],
          },
        });
      }
      const usage = info.usage;
      await finishRun({
        db,
        context,
        status: "completed",
        finishReason: info.finishReason,
        usage,
      });
      const timestamp = nowSeconds();
      await db.prepare(
        `INSERT INTO ai_usage
         (id, userId, teamId, model, endpoint, inputTokens, outputTokens,
          reasoningTokens, cachedInputTokens, totalTokens, estimatedCostUsd,
          conversationId, finishReason, createdAt, updatedAt, updateCounter)
         VALUES (?, ?, ?, ?, '/api/assistant', ?, ?, 0, 0, ?, '0', ?, ?, ?, ?, 0)`,
      ).bind(
        `aiu_${crypto.randomUUID()}`,
        context.userId,
        context.teamId,
        model,
        usage?.promptTokens ?? 0,
        usage?.completionTokens ?? 0,
        usage?.totalTokens ?? 0,
        context.chatId,
        info.finishReason,
        timestamp,
        timestamp,
      ).run();
    },
    onAbort(_middlewareContext, info) {
      return finishRun({
        db,
        context,
        status: "aborted",
        errorCode: info.reason ? "ABORTED" : undefined,
      });
    },
    onError(_middlewareContext, info) {
      return finishRun({ db, context, status: "error", errorCode: "MODEL_ERROR" });
    },
  };
}
