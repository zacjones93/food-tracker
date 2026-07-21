import "server-only";

import { getDB } from "@/db";
import { aiChatsTable, aiMessagesTable } from "@/db/schema";
import {
  assertMobileMutationOrigin,
  MobileAPIError,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ chatId: string }>;
}

async function requireOwnedChat({
  chatId,
  teamId,
  userId,
}: {
  chatId: string;
  teamId: string;
  userId: string;
}) {
  const chat = await getDB().query.aiChatsTable.findFirst({
    where: and(
      eq(aiChatsTable.id, chatId),
      eq(aiChatsTable.userId, userId),
      eq(aiChatsTable.teamId, teamId),
    ),
  });
  if (!chat) throw new MobileAPIError(404, "Conversation not found");
  return chat;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const [{ chatId }, { teamId, userId }] = await Promise.all([
      params,
      requireMobileSession(),
    ]);
    const chat = await requireOwnedChat({ chatId, teamId, userId });
    const rows = await getDB().query.aiMessagesTable.findMany({
      where: eq(aiMessagesTable.chatId, chatId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit: 200,
      with: {
        parts: {
          orderBy: (parts, { asc }) => [asc(parts.partOrder)],
        },
      },
    });
    const messages = rows.reverse().flatMap((message) => {
      const text = message.parts
        .map((part) => part.text_content ?? "")
        .join("")
        .trim();
      if (!text) return [];
      return [{
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        text,
      }];
    });

    return Response.json({ chat, messages }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertMobileMutationOrigin(request);
    const [{ chatId }, { teamId, userId }, { title }] = await Promise.all([
      params,
      requireMobileSession(),
      request.json().then((body) => z.object({
        title: z.string().trim().min(1).max(80),
      }).parse(body)),
    ]);
    await requireOwnedChat({ chatId, teamId, userId });
    await getDB()
      .update(aiChatsTable)
      .set({ title, updatedAt: new Date() })
      .where(
        and(
          eq(aiChatsTable.id, chatId),
          eq(aiChatsTable.userId, userId),
          eq(aiChatsTable.teamId, teamId),
        ),
      );
    return Response.json({ success: true });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
