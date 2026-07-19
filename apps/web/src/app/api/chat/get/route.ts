import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { getChat } from "@/lib/ai/chat-actions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    // Auth check
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get chatId from query params
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json(null);
    }

    // Load chat metadata
    const chat = await getChat(chatId);

    if (!chat) {
      return NextResponse.json(null);
    }

    // Verify ownership
    if (chat.userId !== session.user.id && chat.teamId !== session.activeTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(chat);
  } catch (error) {
    console.error("Get chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
