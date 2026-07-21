import "server-only";

import type { AiMessage, AiMessagePart } from "@/db/schema";
import type { AssistantMessage } from "@/lib/assistant/types";

type PartRow = Omit<AiMessagePart, "id" | "createdAt" | "updatedAt" | "updateCounter">;
type MessagePart = AssistantMessage["parts"][number];

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPersistedPart(value: unknown): value is MessagePart {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "text" || value.type === "thinking") return typeof value.content === "string";
  if (value.type === "tool-call") {
    return typeof value.id === "string" && typeof value.name === "string"
      && typeof value.arguments === "string" && typeof value.state === "string";
  }
  if (value.type === "tool-result") {
    return typeof value.toolCallId === "string" && typeof value.state === "string";
  }
  return ["image", "audio", "video", "document", "structured-output", "ui-resource"].includes(value.type);
}

function emptyPartRow(messageId: string, partOrder: number): PartRow {
  return {
    messageId,
    partOrder,
    partType: null,
    payloadJson: null,
    text_content: null,
    tool_name: null,
    tool_call_id: null,
    tool_args: null,
    tool_result: null,
    tool_state: null,
    image_url: null,
    image_mime_type: null,
    file_url: null,
    file_name: null,
    file_type: null,
    file_metadata: null,
  };
}

export function assistantMessageToDbRows(message: AssistantMessage): {
  messageRow: Omit<AiMessage, "createdAt" | "updatedAt" | "updateCounter">;
  partRows: PartRow[];
} {
  const partRows = message.parts.map((part, partOrder): PartRow => {
    const row = {
      ...emptyPartRow(message.id, partOrder),
      partType: part.type,
      payloadJson: JSON.stringify(part),
    };
    if (part.type === "text") return { ...row, text_content: part.content };
    if (part.type === "tool-call") {
      return {
        ...row,
        tool_name: part.name,
        tool_call_id: part.id,
        tool_args: part.arguments,
        tool_result: part.output === undefined ? null : JSON.stringify(part.output),
        tool_state: part.state,
      };
    }
    if (part.type === "tool-result") {
      return {
        ...row,
        tool_call_id: part.toolCallId,
        tool_result: JSON.stringify(part.content),
        tool_state: part.state,
      };
    }
    return row;
  });
  return {
    messageRow: { id: message.id, chatId: "", role: message.role },
    partRows,
  };
}

function legacyPart(row: AiMessagePart): MessagePart {
  if (row.text_content !== null) return { type: "text", content: row.text_content };
  if (row.tool_name && row.tool_call_id) {
    const output = parseJson(row.tool_result);
    return {
      type: "tool-call",
      id: row.tool_call_id,
      name: row.tool_name,
      arguments: row.tool_args ?? "{}",
      input: parseJson(row.tool_args),
      state: output === undefined ? "input-complete" : "complete",
      ...(output === undefined ? {} : { output }),
    };
  }
  return { type: "text", content: "" };
}

export function dbRowsToAssistantMessage(
  messageRow: AiMessage,
  partRows: AiMessagePart[],
): AssistantMessage {
  const parts = [...partRows]
    .sort((left, right) => left.partOrder - right.partOrder)
    .map((row) => {
      const payload = parseJson(row.payloadJson);
      return isPersistedPart(payload) ? payload : legacyPart(row);
    });
  const role = messageRow.role === "user" || messageRow.role === "system"
    ? messageRow.role
    : "assistant";
  return { id: messageRow.id, role, parts };
}
