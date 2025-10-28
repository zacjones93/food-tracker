import "server-only";
import { createServerAction } from "zsa";
import { z } from "zod";
import { getSessionFromCookie } from "@/utils/auth";
import { getDB } from "@/db";
import { aiChatsTable } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ZSAError } from "zsa";

/**
 * Get all chat conversations for the active team
 */
export const getChatHistoryAction = createServerAction().handler(async () => {
  const session = await getSessionFromCookie();
  if (!session) {
    throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
  }

  if (!session.activeTeamId) {
    throw new ZSAError("FORBIDDEN", "No active team selected");
  }

  const db = getDB();
  const chats = await db
    .select({
      id: aiChatsTable.id,
      title: aiChatsTable.title,
      createdAt: aiChatsTable.createdAt,
      updatedAt: aiChatsTable.updatedAt,
    })
    .from(aiChatsTable)
    .where(eq(aiChatsTable.teamId, session.activeTeamId))
    .orderBy(desc(aiChatsTable.updatedAt))
    .limit(50);

  return chats.map((chat) => ({
    id: chat.id,
    title: chat.title || "Untitled Chat",
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  }));
});

/**
 * Create a new chat conversation
 */
export const createChatAction = createServerAction()
  .input(
    z.object({
      id: z.string(),
      title: z.string().optional(),
    })
  )
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();
    const chat = await db
      .insert(aiChatsTable)
      .values({
        id: input.id,
        teamId: session.activeTeamId,
        userId: session.user.id,
        title: input.title,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return chat[0];
  });

/**
 * Update chat title
 */
export const updateChatTitleAction = createServerAction()
  .input(
    z.object({
      chatId: z.string(),
      title: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();
    // Verify ownership
    const chat = await db.query.aiChatsTable.findFirst({
      where: and(
        eq(aiChatsTable.id, input.chatId),
        eq(aiChatsTable.teamId, session.activeTeamId)
      ),
    });

    if (!chat) {
      throw new ZSAError("NOT_FOUND", "Chat not found");
    }

    await db
      .update(aiChatsTable)
      .set({
        title: input.title,
        updatedAt: new Date(),
      })
      .where(eq(aiChatsTable.id, input.chatId));

    return { success: true };
  });

/**
 * Delete a chat conversation
 */
export const deleteChatAction = createServerAction()
  .input(
    z.object({
      chatId: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();
    // Verify ownership
    const chat = await db.query.aiChatsTable.findFirst({
      where: and(
        eq(aiChatsTable.id, input.chatId),
        eq(aiChatsTable.teamId, session.activeTeamId)
      ),
    });

    if (!chat) {
      throw new ZSAError("NOT_FOUND", "Chat not found");
    }

    await db.delete(aiChatsTable).where(eq(aiChatsTable.id, input.chatId));

    return { success: true };
  });
