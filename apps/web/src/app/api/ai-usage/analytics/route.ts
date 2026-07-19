import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/utils/auth";
import { getDB } from "@/db/index";
import { aiUsageTable, userTable } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.activeTeamId) {
      return NextResponse.json({ error: "No active team" }, { status: 400 });
    }

    const db = getDB();
    const teamId = session.activeTeamId;
    const period = req.nextUrl.searchParams.get("period") || "week";
    const now = new Date();
    let startDate: Date;

    // Calculate start date based on period
    switch (period) {
      case "day":
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "all":
        startDate = new Date(0); // Unix epoch
        break;
      default:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
    }

    // Fetch usage records
    const usageRecords = await db
      .select()
      .from(aiUsageTable)
      .where(and(eq(aiUsageTable.teamId, teamId), gte(aiUsageTable.createdAt, startDate)))
      .orderBy(desc(aiUsageTable.createdAt));

    // Calculate aggregates
    const totalRequests = usageRecords.length;
    const totalTokens = usageRecords.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalInputTokens = usageRecords.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = usageRecords.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalCost = usageRecords.reduce((sum, r) => sum + parseFloat(r.estimatedCostUsd), 0);

    // Group by day for charts
    const byDay: Record<string, { date: string; requests: number; tokens: number; cost: number }> = {};

    usageRecords.forEach((record) => {
      const dateKey = new Date(record.createdAt).toISOString().split("T")[0];
      if (!byDay[dateKey]) {
        byDay[dateKey] = { date: dateKey, requests: 0, tokens: 0, cost: 0 };
      }
      byDay[dateKey].requests += 1;
      byDay[dateKey].tokens += record.totalTokens;
      byDay[dateKey].cost += parseFloat(record.estimatedCostUsd);
    });

    const dailyStats = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    // Group by model
    const byModel: Record<string, { model: string; requests: number; tokens: number; cost: number }> = {};

    usageRecords.forEach((record) => {
      if (!byModel[record.model]) {
        byModel[record.model] = { model: record.model, requests: 0, tokens: 0, cost: 0 };
      }
      byModel[record.model].requests += 1;
      byModel[record.model].tokens += record.totalTokens;
      byModel[record.model].cost += parseFloat(record.estimatedCostUsd);
    });

    const modelStats = Object.values(byModel).sort((a, b) => b.cost - a.cost);

    // Group by user
    const byUser: Record<string, { userId: string; requests: number; tokens: number; cost: number }> = {};

    usageRecords.forEach((record) => {
      if (!byUser[record.userId]) {
        byUser[record.userId] = { userId: record.userId, requests: 0, tokens: 0, cost: 0 };
      }
      byUser[record.userId].requests += 1;
      byUser[record.userId].tokens += record.totalTokens;
      byUser[record.userId].cost += parseFloat(record.estimatedCostUsd);
    });

    // Fetch user details for user stats
    const userIds = Object.keys(byUser);

    // Fetch all users in the team
    const userMap = new Map<string, { firstName: string | null; lastName: string | null; email: string }>();
    for (const userId of userIds) {
      const user = await db
        .select({ id: userTable.id, firstName: userTable.firstName, lastName: userTable.lastName, email: userTable.email })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

      if (user.length > 0) {
        userMap.set(userId, {
          firstName: user[0].firstName,
          lastName: user[0].lastName,
          email: user[0].email,
        });
      }
    }

    const userStats = Object.values(byUser).map((stat) => {
      const user = userMap.get(stat.userId);
      return {
        userId: stat.userId,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown User',
        requests: stat.requests,
        tokens: stat.tokens,
        cost: stat.cost,
      };
    }).sort((a, b) => b.cost - a.cost);

    // Group by finish reason
    const finishReasons: Record<string, number> = {};
    usageRecords.forEach((record) => {
      const reason = record.finishReason || "unknown";
      finishReasons[reason] = (finishReasons[reason] || 0) + 1;
    });

    // Calculate averages
    const avgTokensPerRequest = totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0;
    const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

    return NextResponse.json({
      summary: {
        totalRequests,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCost: totalCost.toFixed(4),
        avgTokensPerRequest,
        avgCostPerRequest: avgCostPerRequest.toFixed(4),
      },
      dailyStats,
      modelStats,
      userStats,
      finishReasons,
      recentRequests: usageRecords.slice(0, 20).map((r) => ({
        id: r.id,
        model: r.model,
        endpoint: r.endpoint,
        tokens: r.totalTokens,
        cost: r.estimatedCostUsd,
        finishReason: r.finishReason,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching usage analytics:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
