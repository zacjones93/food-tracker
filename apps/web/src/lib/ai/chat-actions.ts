import "server-only";
import type { AssistantMessage } from "@/lib/assistant/types";
import { getDB } from "@/db/index";
import { aiChatsTable, aiMessagesTable, aiMessagePartsTable } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { assistantMessageToDbRows, dbRowsToAssistantMessage } from "./message-mapping";
import {
  getAuthorizedChat,
  isChatOwnedBy,
  type AiChatAccessContext,
} from "./access-control";
import { createAiDomainError } from "./permissions";

/**
 * Upsert a message (and its parts) into the database
 * Uses delete + insert pattern since D1 doesn't support transactions
 */
export async function upsertMessage({
  message,
  chatId,
  userId,
  teamId,
}: {
  message: AssistantMessage;
  chatId: string;
  userId: string;
  teamId: string;
}): Promise<void> {
  const db = getDB();

  await requireOwnedChat({ chatId, userId, teamId });

  const { messageRow, partRows } = assistantMessageToDbRows(message);

  // Skip messages with no parts (incomplete streaming)
  if (partRows.length === 0) {
    return;
  }

  // Delete existing parts for this message (if updating)
  await db.delete(aiMessagePartsTable).where(eq(aiMessagePartsTable.messageId, message.id));

  // Delete existing message (if updating)
  await db.delete(aiMessagesTable).where(eq(aiMessagesTable.id, message.id));

  // Insert message
  try {
    const now = new Date();
    await db.insert(aiMessagesTable).values({
      ...messageRow,
      chatId,
      createdAt: now,
      updatedAt: now,
      updateCounter: 0,
    });
  } catch (error) {
      throw error;
  }

  // Insert parts in batches to avoid D1's SQL variable limit
  // D1 has a limit of ~999 SQL variables per query
  // With 18 columns per part, we can safely insert ~50 parts at a time
  if (partRows.length > 0) {
    const BATCH_SIZE = 50;
    try {
      for (let i = 0; i < partRows.length; i += BATCH_SIZE) {
        const batch = partRows.slice(i, i + BATCH_SIZE);
        await db.insert(aiMessagePartsTable).values(batch);
      }
    } catch (error) {
      throw error;
    }
  }
}

/**
 * Validate and filter message sequence to ensure AI SDK compatibility
 * Rules:
 * - Must alternate between user and assistant messages
 * - If multiple consecutive user messages, keep only the last one
 * - If multiple consecutive assistant messages, keep all (valid for multi-part responses)
 * - Must start with user message
 * - Must NOT end with user message (to allow new user messages to be appended)
 */
function validateMessageSequence(messages: AssistantMessage[]): AssistantMessage[] {
  if (messages.length === 0) return messages;

  const validMessages: AssistantMessage[] = [];
  let lastRole: string | null = null;

  for (const message of messages) {
    // If same role as last message
    if (lastRole === message.role) {
      if (message.role === "user") {
        // Multiple user messages in a row - replace previous user message
        validMessages.pop();
        validMessages.push(message);
      } else {
        // Multiple assistant messages OK (multi-part responses)
        validMessages.push(message);
      }
    } else {
      // Different role - add message
      validMessages.push(message);
      lastRole = message.role;
    }
  }

  // Ensure we start with user message (AI SDK requirement)
  while (validMessages.length > 0 && validMessages[0]?.role !== "user") {
    validMessages.shift();
  }

  // Ensure we DON'T end with user message (to prevent consecutive user messages when appending)
  // This handles the case where a user sent a message but got no response
  if (validMessages.length > 0 && validMessages[validMessages.length - 1].role === "user") {
    validMessages.pop();
  }

  return validMessages;
}

/**
 * Load messages for a chat session with pagination support
 * Returns messages in chronological order (oldest first) with parts reconstructed
 * Pagination works by fetching the most recent messages in DESC order, then reversing
 */
export async function loadChat({
  chatId,
  userId,
  teamId,
  limit = 1000,
  offset = 0,
}: AiChatAccessContext & {
  limit?: number;
  offset?: number;
}): Promise<{ messages: AssistantMessage[]; hasMore: boolean }> {
  const db = getDB();

  await requireOwnedChat({ chatId, userId, teamId });

  // First, count total messages to determine hasMore
  const allMessages = await db.query.aiMessagesTable.findMany({
    where: eq(aiMessagesTable.chatId, chatId),
    columns: { id: true },
  });
  const totalCount = allMessages.length;

  // Load messages in ASC order (oldest first) for pagination
  // Offset 0 gets oldest messages, offset N gets newer messages
  const messagesWithParts = await db.query.aiMessagesTable.findMany({
    where: eq(aiMessagesTable.chatId, chatId),
    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    limit: limit,
    offset: offset,
    with: {
      parts: {
        orderBy: (parts, { asc }) => [asc(parts.partOrder)],
      },
    },
  });

  // Already in chronological order
  const messagesInChronologicalOrder = messagesWithParts;

  // Convert to UIMessages and filter out messages with no parts (corrupt data)
  const uiMessages = messagesInChronologicalOrder
    .filter((msg) => msg.parts.length > 0)
    .map((msg) => dbRowsToAssistantMessage(msg, msg.parts));

  // Validate and filter to ensure proper message alternation
  const validMessages = validateMessageSequence(uiMessages);

  return {
    messages: validMessages,
    hasMore: offset + limit < totalCount,
  };
}

/**
 * Get chat metadata
 */
export async function getChat(chatId: string) {
  const db = getDB();

  return await db.query.aiChatsTable.findFirst({
    where: eq(aiChatsTable.id, chatId),
  });
}

async function requireOwnedChat({ chatId, userId, teamId }: AiChatAccessContext) {
  const chat = await getAuthorizedChat({ chatId, userId, teamId });
  if (chat) return chat;

  throw createAiDomainError({
    code: "CHAT_FORBIDDEN",
    message: "Forbidden",
    status: 403,
  });
}

/**
 * Get or create chat (lazy initialization)
 * Used when client sends a chat ID that may not exist in DB yet
 */
export async function getOrCreateChat({
  chatId,
  userId,
  teamId,
  title,
}: {
  chatId: string;
  userId: string;
  teamId: string;
  title?: string;
}): Promise<string> {
  const db = getDB();

  // Check if chat exists
  const existing = await getChat(chatId);
  if (existing) {
    if (isChatOwnedBy({ chat: existing, userId, teamId })) {
      return existing.id;
    }

    throw createAiDomainError({
      code: "CHAT_FORBIDDEN",
      message: "Forbidden",
      status: 403,
    });
  }

  // Create new chat with provided ID
  try {
    const now = new Date();
    await db.insert(aiChatsTable).values({
      id: chatId, // Use client-provided ID
      userId,
      teamId,
      title: title || null,
      createdAt: now,
      updatedAt: now,
      updateCounter: 0,
    });
  } catch (error) {
    const conflictingChat = await getChat(chatId);
    if (conflictingChat && isChatOwnedBy({ chat: conflictingChat, userId, teamId })) {
      return conflictingChat.id;
    }

    if (conflictingChat) {
      throw createAiDomainError({
        code: "CHAT_CONFLICT",
        message: "Chat ID is already in use",
        status: 409,
        cause: error,
      });
    }

    throw error;
  }

  return chatId;
}

/**
 * List all chats for a user/team
 */
export async function listChats({
  userId,
  teamId,
  limit = 50,
}: {
  userId: string;
  teamId: string;
  limit?: number;
}) {
  const db = getDB();

  return await db.query.aiChatsTable.findMany({
    where: and(
      eq(aiChatsTable.userId, userId),
      eq(aiChatsTable.teamId, teamId),
    ),
    orderBy: [desc(aiChatsTable.updatedAt)],
    limit,
  });
}

/**
 * Delete a chat and all its messages/parts (CASCADE handles this)
 */
export async function deleteChat({
  chatId,
  userId,
  teamId,
}: AiChatAccessContext): Promise<void> {
  const db = getDB();
  await requireOwnedChat({ chatId, userId, teamId });
  await db.delete(aiChatsTable).where(
    and(
      eq(aiChatsTable.id, chatId),
      eq(aiChatsTable.userId, userId),
      eq(aiChatsTable.teamId, teamId),
    ),
  );
}

/**
 * Update chat title
 */
export async function updateChatTitle({
  chatId,
  title,
  userId,
  teamId,
}: {
  chatId: string;
  title: string;
  userId: string;
  teamId: string;
}): Promise<void> {
  const db = getDB();
  await requireOwnedChat({ chatId, userId, teamId });
  await db
    .update(aiChatsTable)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(aiChatsTable.id, chatId),
        eq(aiChatsTable.userId, userId),
        eq(aiChatsTable.teamId, teamId),
      ),
    );
}
