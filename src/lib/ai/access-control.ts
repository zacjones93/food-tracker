import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gte, sql } from "drizzle-orm";
import { teamTable, teamSettingsTable, aiUsageTable } from "@/db/schema";

const ALLOWED_TEAM_SLUG = "team_default";

export async function checkAiAccess(teamId: string): Promise<{
  allowed: boolean;
  reason?: string;
  settings?: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
}> {
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Get team details
  const teamData = await db.query.teamTable.findFirst({
    where: eq(teamTable.id, teamId),
    with: {
      settings: true,
    },
  });

  if (!teamData) {
    return { allowed: false, reason: "Team not found" };
  }

  // Check if team is allowed (slug-based restriction)
  if (teamData.slug !== ALLOWED_TEAM_SLUG) {
    return {
      allowed: false,
      reason: "This feature is currently restricted. Please talk to Zac or Mariah about using this feature.",
    };
  }

  // Check if AI is enabled in team settings
  if (!teamData.settings?.aiEnabled) {
    return {
      allowed: false,
      reason: "AI features are disabled for this team.",
    };
  }

  // Return allowed with settings
  return {
    allowed: true,
    settings: {
      monthlyBudgetUsd: parseFloat(teamData.settings.aiMonthlyBudgetUsd ?? "10.0"),
      maxTokensPerRequest: teamData.settings.aiMaxTokensPerRequest ?? 4000,
      maxRequestsPerDay: teamData.settings.aiMaxRequestsPerDay ?? 100,
    },
  };
}

export async function checkDailyUsageLimit(
  teamId: string,
  maxRequests: number
): Promise<{ withinLimit: boolean; currentCount: number }> {
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Get today's usage count
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const usageCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.teamId, teamId),
        gte(aiUsageTable.createdAt, today)
      )
    );

  const currentCount = usageCount[0]?.count ?? 0;

  return {
    withinLimit: currentCount < maxRequests,
    currentCount,
  };
}

export async function getMonthlyUsage(teamId: string): Promise<{
  totalRequests: number;
  totalCostUsd: number;
  budgetUsd: number;
  percentUsed: number;
}> {
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Get current month's usage
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const usage = await db
    .select({
      count: sql<number>`count(*)`,
      totalCost: sql<number>`sum(CAST(${aiUsageTable.estimatedCostUsd} AS REAL))`,
    })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.teamId, teamId),
        gte(aiUsageTable.createdAt, firstDayOfMonth)
      )
    );

  const totalRequests = usage[0]?.count ?? 0;
  const totalCostUsd = usage[0]?.totalCost ?? 0;

  // Get budget from team settings
  const teamData = await db.query.teamSettingsTable.findFirst({
    where: eq(teamSettingsTable.teamId, teamId),
  });

  const budgetUsd = parseFloat(teamData?.aiMonthlyBudgetUsd ?? "10.0");

  return {
    totalRequests,
    totalCostUsd,
    budgetUsd,
    percentUsed: budgetUsd > 0 ? (totalCostUsd / budgetUsd) * 100 : 0,
  };
}
