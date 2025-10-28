import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { getChat } from "@/lib/ai/chat-actions";
import { getDB } from "@/db";
import { aiChatsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Auth check
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json() as { chatId?: string; title?: string };
    const { chatId, title } = body;

    if (!chatId || !title) {
      return NextResponse.json(
        { error: "Missing chatId or title" },
        { status: 400 }
      );
    }

    // Verify chat ownership
    const chat = await getChat(chatId);

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (chat.userId !== session.user.id && chat.teamId !== session.activeTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update title
    const db = getDB();
    if (!db) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    await db
      .update(aiChatsTable)
      .set({ title: title.trim() })
      .where(eq(aiChatsTable.id, chatId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update title error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
