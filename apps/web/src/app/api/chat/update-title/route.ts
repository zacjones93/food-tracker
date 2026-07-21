import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { getAuthorizedChat, getChat, updateChatTitle } from "@/lib/ai/chat-actions";
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

    if (!session.activeTeamId) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    // Verify chat ownership
    const chat = await getAuthorizedChat({
      chatId,
      userId: session.user.id,
      teamId: session.activeTeamId,
    });

    if (!chat) {
      const existingChat = await getChat(chatId);
      if (!existingChat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update title
    await updateChatTitle({
      chatId,
      title: title.trim(),
      userId: session.user.id,
      teamId: session.activeTeamId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update title error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
