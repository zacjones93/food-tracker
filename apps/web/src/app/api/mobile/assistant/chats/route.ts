import "server-only";

import { getDB } from "@/db";
import { aiChatsTable } from "@/db/schema";
import { mobileAPIErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { teamId, userId } = await requireMobileSession();
    const chats = await getDB()
      .select({
        id: aiChatsTable.id,
        title: aiChatsTable.title,
        createdAt: aiChatsTable.createdAt,
        updatedAt: aiChatsTable.updatedAt,
      })
      .from(aiChatsTable)
      .where(
        and(
          eq(aiChatsTable.userId, userId),
          eq(aiChatsTable.teamId, teamId),
        ),
      )
      .orderBy(desc(aiChatsTable.updatedAt))
      .limit(50);

    return Response.json({ chats }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
