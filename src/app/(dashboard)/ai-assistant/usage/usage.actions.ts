import "server-only";
import { createServerAction } from "zsa";
import { z } from "zod";
import { getSessionFromCookie } from "@/utils/auth";
import { db } from "@/db";
import { aiUsageTable } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { ZSAError } from "zsa";

/**
 * Get AI usage analytics for a team
 */
export const getUsageAnalyticsAction = createServerAction()
  .input(
    z.object({
      period: z.enum(["day", "week", "month", "all"]).default("week"),
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

    const teamId = session.activeTeamId;
    const now = new Date();
    let startDate: Date;

    // Calculate start date based on period
    switch (input.period) {
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
    }

    // Fetch usage records
    const usageRecords = await db
      .select()
      .from(aiUsageTable)
      .where(
        and(
          eq(aiUsageTable.teamId, teamId),
          gte(aiUsageTable.createdAt, startDate)
        )
      )
      .orderBy(desc(aiUsageTable.createdAt));

    // Calculate aggregates
    const totalRequests = usageRecords.length;
    const totalTokens = usageRecords.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalInputTokens = usageRecords.reduce(
      (sum, r) => sum + r.inputTokens,
      0
    );
    const totalOutputTokens = usageRecords.reduce(
      (sum, r) => sum + r.outputTokens,
      0
    );
    const totalCost = usageRecords.reduce(
      (sum, r) => sum + parseFloat(r.estimatedCostUsd),
      0
    );

    // Group by day for charts
    const byDay: Record<
      string,
      { date: string; requests: number; tokens: number; cost: number }
    > = {};

    usageRecords.forEach((record) => {
      const dateKey = new Date(record.createdAt).toISOString().split("T")[0];
      if (!byDay[dateKey]) {
        byDay[dateKey] = { date: dateKey, requests: 0, tokens: 0, cost: 0 };
      }
      byDay[dateKey].requests += 1;
      byDay[dateKey].tokens += record.totalTokens;
      byDay[dateKey].cost += parseFloat(record.estimatedCostUsd);
    });

    const dailyStats = Object.values(byDay).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Group by model
    const byModel: Record<
      string,
      { model: string; requests: number; tokens: number; cost: number }
    > = {};

    usageRecords.forEach((record) => {
      if (!byModel[record.model]) {
        byModel[record.model] = {
          model: record.model,
          requests: 0,
          tokens: 0,
          cost: 0,
        };
      }
      byModel[record.model].requests += 1;
      byModel[record.model].tokens += record.totalTokens;
      byModel[record.model].cost += parseFloat(record.estimatedCostUsd);
    });

    const modelStats = Object.values(byModel).sort((a, b) => b.cost - a.cost);

    // Group by finish reason
    const finishReasons: Record<string, number> = {};
    usageRecords.forEach((record) => {
      const reason = record.finishReason || "unknown";
      finishReasons[reason] = (finishReasons[reason] || 0) + 1;
    });

    // Calculate averages
    const avgTokensPerRequest =
      totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0;
    const avgCostPerRequest =
      totalRequests > 0 ? totalCost / totalRequests : 0;

    return {
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
    };
  });
