import "server-only";
import type { UIMessage } from "ai";
import { getDB } from "@/db/index";
import { aiChatsTable, aiMessagesTable, aiMessagePartsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { uiMessageToDbRows, dbRowsToUIMessage } from "./message-mapping";

/**
 * Upsert a message (and its parts) into the database
 * Uses delete + insert pattern since D1 doesn't support transactions
 */
export async function upsertMessage({
  message,
  chatId,
}: {
  message: UIMessage;
  chatId: string;
}): Promise<void> {
  const db = getDB();

  console.log("💬 upsertMessage called:", { messageId: message.id, chatId, role: message.role, partsCount: message.parts?.length || 0 });

  const { messageRow, partRows } = uiMessageToDbRows(message);

  console.log("🔄 Converted to DB format:", { messageRow, partCount: partRows.length });

  // Skip messages with no parts (incomplete streaming)
  if (partRows.length === 0) {
    console.log("⚠️ Skipping message with no parts (likely incomplete stream):", message.id);
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
      createdAt: messageRow.createdAt || now,
      updatedAt: messageRow.updatedAt || now,
      updateCounter: 0,
    });
    console.log("✅ Message inserted:", message.id);
  } catch (error) {
    console.error("❌ Failed to insert message:", error);
    throw error;
  }

  // Insert parts in batches to avoid D1's SQL variable limit
  // D1 has a limit of ~999 SQL variables per query
  // With 18 columns per part, we can safely insert ~50 parts at a time
  if (partRows.length > 0) {
    const BATCH_SIZE = 50;
    let insertedCount = 0;

    try {
      for (let i = 0; i < partRows.length; i += BATCH_SIZE) {
        const batch = partRows.slice(i, i + BATCH_SIZE);
        await db.insert(aiMessagePartsTable).values(batch);
        insertedCount += batch.length;
      }
      console.log("✅ Parts inserted:", insertedCount);
    } catch (error) {
      console.error("❌ Failed to insert parts:", error);
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
function validateMessageSequence(messages: UIMessage[]): UIMessage[] {
  if (messages.length === 0) return messages;

  const validMessages: UIMessage[] = [];
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
  if (validMessages.length > 0 && validMessages[0].role !== "user") {
    console.warn("⚠️ First message is not from user, removing assistant messages at start");
    while (validMessages.length > 0 && validMessages[0].role !== "user") {
      validMessages.shift();
    }
  }

  // Ensure we DON'T end with user message (to prevent consecutive user messages when appending)
  // This handles the case where a user sent a message but got no response
  if (validMessages.length > 0 && validMessages[validMessages.length - 1].role === "user") {
    console.warn("⚠️ Removing trailing user message without assistant response");
    validMessages.pop();
  }

  return validMessages;
}

/**
 * Load messages for a chat session with pagination support
 * Returns messages in chronological order (oldest first) with parts reconstructed
 * Pagination works by fetching the most recent messages in DESC order, then reversing
 */
export async function loadChat(
  chatId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ messages: UIMessage[]; hasMore: boolean }> {
  const db = getDB();
  const limit = options?.limit || 1000; // Default to all messages
  const offset = options?.offset || 0;

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
    .map((msg) => dbRowsToUIMessage(msg, msg.parts));

  // Validate and filter to ensure proper message alternation
  const validMessages = validateMessageSequence(uiMessages);

  console.log("📊 Message validation:", {
    loaded: uiMessages.length,
    valid: validMessages.length,
    filtered: uiMessages.length - validMessages.length,
  });

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

  console.log("📝 getOrCreateChat called with:", { chatId, userId, teamId, title });

  // Check if chat exists
  const existing = await getChat(chatId);
  if (existing) {
    console.log("✅ Chat already exists:", existing.id);
    return existing.id;
  }

  console.log("🆕 Creating new chat...");
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
    console.log("✅ Chat created successfully:", chatId);
  } catch (error) {
    console.error("❌ Failed to create chat:", error);
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
  userId?: string;
  teamId?: string;
  limit?: number;
}) {
  const db = getDB();

  // Build where clause
  const conditions = [];
  if (userId) conditions.push(eq(aiChatsTable.userId, userId));
  if (teamId) conditions.push(eq(aiChatsTable.teamId, teamId));

  return await db.query.aiChatsTable.findMany({
    where: conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : undefined) : undefined,
    orderBy: [desc(aiChatsTable.createdAt)],
    limit,
  });
}

/**
 * Delete a chat and all its messages/parts (CASCADE handles this)
 */
export async function deleteChat(chatId: string): Promise<void> {
  const db = getDB();
  await db.delete(aiChatsTable).where(eq(aiChatsTable.id, chatId));
}

/**
 * Update chat title
 */
export async function updateChatTitle({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}): Promise<void> {
  const db = getDB();
  await db.update(aiChatsTable).set({ title }).where(eq(aiChatsTable.id, chatId));
}
