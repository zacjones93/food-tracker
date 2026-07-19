import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { loadChat, getChat } from "@/lib/ai/chat-actions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    // Auth check
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get chatId and pagination params from query params
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!chatId) {
      return NextResponse.json({ messages: [], title: null, hasMore: false });
    }

    // Verify chat ownership before loading messages
    const chat = await getChat(chatId);

    if (!chat) {
      return NextResponse.json({ messages: [], title: null, hasMore: false });
    }

    if (chat.userId !== session.user.id && chat.teamId !== session.activeTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load messages with pagination
    const { messages, hasMore } = await loadChat(chatId, { limit, offset });
    return NextResponse.json({
      messages,
      title: chat.title,
      hasMore,
    });
  } catch (error) {
    console.error("Load messages error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
