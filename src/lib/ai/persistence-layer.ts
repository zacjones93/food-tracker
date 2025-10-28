import "server-only";
import type { MyUIMessage } from "@/app/api/chat/route";
import { getDB } from "@/db";
import {
  aiChatsTable,
  aiMessagesTable,
  aiMessagePartsTable,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export interface DBChat {
  id: string;
  messages: MyUIMessage[];
  createdAt: Date;
  updatedAt: Date;
  title?: string;
}

// Type guards for UIMessage parts
interface TextPart {
  type: "text";
  text: string;
}

interface ToolPart {
  type: string; // "tool-${name}"
  toolCallId: string;
  input?: Record<string, unknown>;
  output?: unknown;
  state?: string;
}

/**
 * Convert DB message parts to UIMessage format
 */
function partsToUIMessage(
  messageId: string,
  role: string,
  parts: Array<{
    partOrder: number;
    text_content: string | null;
    tool_name: string | null;
    tool_call_id: string | null;
    tool_args: string | null;
    tool_result: string | null;
    tool_state?: string | null;
  }>
): MyUIMessage {
  const uiParts = parts
    .sort((a, b) => a.partOrder - b.partOrder)
    .map((part) => {
      if (part.text_content) {
        return { type: "text" as const, text: part.text_content };
      }
      // AI SDK v5 tool parts use "tool-${TOOL_NAME}" as type
      if (part.tool_name && part.tool_call_id) {
        const toolType = `tool-${part.tool_name}` as string;
        const toolState = part.tool_state || "output-available";

        if (part.tool_result) {
          return {
            type: toolType,
            toolCallId: part.tool_call_id,
            input: part.tool_args ? JSON.parse(part.tool_args) : {},
            output: JSON.parse(part.tool_result),
            state: toolState,
          };
        } else {
          return {
            type: toolType,
            toolCallId: part.tool_call_id,
            input: part.tool_args ? JSON.parse(part.tool_args) : {},
            state: toolState,
          };
        }
      }
      // Default to text if we can't parse
      return { type: "text" as const, text: "" };
    });

  return {
    id: messageId,
    role: role as "user" | "assistant" | "system",
    parts: uiParts as unknown as MyUIMessage['parts'],
  } as MyUIMessage;
}

/**
 * Create a new chat
 */
export async function createChat(
  chatId: string,
  teamId: string,
  userId: string,
  initialMessages: MyUIMessage[] = []
): Promise<DBChat> {
  const db = getDB();
  const now = new Date();

  // Insert chat
  await db.insert(aiChatsTable).values({
    id: chatId,
    teamId,
    userId,
    title: null,
    createdAt: now,
    updatedAt: now,
    updateCounter: 0,
  });

  // Insert initial messages if any
  if (initialMessages.length > 0) {
    await appendToChatMessages(chatId, initialMessages);
  }

  return {
    id: chatId,
    messages: initialMessages,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get a chat by ID with all messages
 */
export async function getChat(chatId: string): Promise<DBChat | null> {
  const db = getDB();
  const chat = await db.query.aiChatsTable.findFirst({
    where: eq(aiChatsTable.id, chatId),
  });

  if (!chat) {
    return null;
  }

  // Get all messages for this chat
  const messages = await db.query.aiMessagesTable.findMany({
    where: eq(aiMessagesTable.chatId, chatId),
    orderBy: [aiMessagesTable.createdAt],
  });

  // Get parts for all messages
  const messageIds = messages.map((m) => m.id);
  const allParts = await db.query.aiMessagePartsTable.findMany({
    where: inArray(aiMessagePartsTable.messageId, messageIds),
  });

  // Group parts by message
  const partsByMessage = new Map<
    string,
    Array<{
      partOrder: number;
      text_content: string | null;
      tool_name: string | null;
      tool_call_id: string | null;
      tool_args: string | null;
      tool_result: string | null;
    }>
  >();

  for (const part of allParts) {
    if (!partsByMessage.has(part.messageId)) {
      partsByMessage.set(part.messageId, []);
    }
    partsByMessage.get(part.messageId)!.push({
      partOrder: part.partOrder,
      text_content: part.text_content,
      tool_name: part.tool_name,
      tool_call_id: part.tool_call_id,
      tool_args: part.tool_args,
      tool_result: part.tool_result,
    });
  }

  // Convert to UIMessages
  const uiMessages: MyUIMessage[] = messages.map((msg) => {
    const parts = partsByMessage.get(msg.id) || [];
    return partsToUIMessage(msg.id, msg.role, parts);
  });

  return {
    id: chat.id,
    messages: uiMessages,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    title: chat.title || undefined,
  };
}

/**
 * Append messages to a chat
 */
export async function appendToChatMessages(
  chatId: string,
  messages: MyUIMessage[]
): Promise<DBChat | null> {
  const db = getDB();
  const chat = await db.query.aiChatsTable.findFirst({
    where: eq(aiChatsTable.id, chatId),
  });

  if (!chat) {
    return null;
  }

  // Insert each message and its parts
  for (const message of messages) {
    // Insert message
    await db.insert(aiMessagesTable).values({
      id: message.id,
      chatId,
      role: message.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      updateCounter: 0,
    });

    // Insert parts
    const partInserts = message.parts.map((part, index) => {
      const basePart = {
        messageId: message.id,
        partOrder: index,
        createdAt: new Date(),
        updatedAt: new Date(),
        updateCounter: 0,
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
        file_mime_type: null,
        file_size: null,
      };

      const partType = part.type as string;

      if (partType === "text") {
        const textPart = part as unknown as TextPart;
        return { ...basePart, text_content: textPart.text };
      }

      // AI SDK v5 tool parts have type "tool-${TOOL_NAME}"
      if (partType.startsWith("tool-")) {
        const toolPart = part as unknown as ToolPart;
        const toolName = partType.substring(5); // Remove "tool-" prefix

        return {
          ...basePart,
          tool_name: toolName,
          tool_call_id: toolPart.toolCallId,
          tool_args: JSON.stringify(toolPart.input || {}),
          tool_result: toolPart.output ? JSON.stringify(toolPart.output) : null,
          tool_state: toolPart.state || "input-available",
        };
      }

      return basePart;
    });

    if (partInserts.length > 0) {
      await db.insert(aiMessagePartsTable).values(partInserts);
    }
  }

  // Update chat timestamp
  await db
    .update(aiChatsTable)
    .set({ updatedAt: new Date() })
    .where(eq(aiChatsTable.id, chatId));

  // Return updated chat
  return getChat(chatId);
}

/**
 * Delete a chat and all its messages
 */
export async function deleteChat(chatId: string): Promise<boolean> {
  const db = getDB();
  await db
    .delete(aiChatsTable)
    .where(eq(aiChatsTable.id, chatId));

  return true; // D1 doesn't return rowsAffected reliably
}

/**
 * Get all chats for a user/team
 */
export async function getChatsForTeam(
  teamId: string,
  userId?: string
): Promise<Array<{ id: string; title?: string; updatedAt: Date }>> {
  const db = getDB();
  const chats = await db.query.aiChatsTable.findMany({
    where: userId
      ? and(eq(aiChatsTable.teamId, teamId), eq(aiChatsTable.userId, userId))
      : eq(aiChatsTable.teamId, teamId),
    orderBy: [desc(aiChatsTable.updatedAt)],
  });

  return chats.map((chat) => ({
    id: chat.id,
    title: chat.title || undefined,
    updatedAt: chat.updatedAt,
  }));
}
