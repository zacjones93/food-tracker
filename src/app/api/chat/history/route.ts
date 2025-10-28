import "server-only";
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/utils/auth";
import { getDB } from "@/db/index";
import { aiChatsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.activeTeamId) {
      return NextResponse.json({ error: "No active team" }, { status: 400 });
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

    return NextResponse.json(
      chats.map((chat) => ({
        id: chat.id,
        title: chat.title || "Untitled Chat",
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Error loading chat history:", error);
    return NextResponse.json(
      { error: "Failed to load chat history" },
      { status: 500 }
    );
  }
}
