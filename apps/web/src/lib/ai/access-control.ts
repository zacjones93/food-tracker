import "server-only";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  aiChatsTable,
  aiUsageTable,
  teamMembershipTable,
  teamSettingsTable,
  teamTable,
} from "@/db/schema";
import { getDB } from "@/db/index";
import { evaluateAiTeamPolicy } from "@/lib/team-settings-policy";

export interface AiChatAccessContext {
  chatId: string;
  userId: string;
  teamId: string;
}

export function isChatOwnedBy({
  chat,
  userId,
  teamId,
}: {
  chat: { userId: string; teamId: string };
  userId: string;
  teamId: string;
}): boolean {
  return chat.userId === userId && chat.teamId === teamId;
}

export async function getAuthorizedChat({
  chatId,
  userId,
  teamId,
}: AiChatAccessContext) {
  const db = getDB();

  return await db.query.aiChatsTable.findFirst({
    where: and(
      eq(aiChatsTable.id, chatId),
      eq(aiChatsTable.userId, userId),
      eq(aiChatsTable.teamId, teamId),
    ),
  });
}

export function resolveMaxOutputTokens({
  maxTokensPerRequest,
}: {
  maxTokensPerRequest: number;
}): number | null {
  if (!Number.isFinite(maxTokensPerRequest) || maxTokensPerRequest <= 0) return null;
  return Math.floor(maxTokensPerRequest);
}

export function isWithinMonthlyBudget({
  currentCostUsd,
  monthlyBudgetUsd,
}: {
  currentCostUsd: number;
  monthlyBudgetUsd: number;
}): boolean {
  return monthlyBudgetUsd > 0 && currentCostUsd < monthlyBudgetUsd;
}

export async function checkAiAccess({
  teamId,
  userId,
}: {
  teamId: string;
  userId: string;
}): Promise<{
  allowed: boolean;
  reason?: string;
  settings?: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
}> {
  const db = getDB();

  const [teamData, membership] = await Promise.all([
    db.query.teamTable.findFirst({
      where: eq(teamTable.id, teamId),
      with: { settings: true },
    }),
    db.query.teamMembershipTable.findFirst({
      where: and(
        eq(teamMembershipTable.teamId, teamId),
        eq(teamMembershipTable.userId, userId),
        eq(teamMembershipTable.isActive, 1),
      ),
    }),
  ]);

  if (!teamData) {
    return { allowed: false, reason: "Team not found" };
  }

  const policy = evaluateAiTeamPolicy({
    hasActiveMembership: Boolean(membership),
    settings: teamData.settings,
  });
  if (!policy.allowed) return policy;

  return {
    allowed: true,
    settings: {
      monthlyBudgetUsd: parseFloat(teamData.settings!.aiMonthlyBudgetUsd ?? "10.0"),
      maxTokensPerRequest: teamData.settings!.aiMaxTokensPerRequest ?? 4000,
      maxRequestsPerDay: teamData.settings!.aiMaxRequestsPerDay ?? 100,
    },
  };
}

export async function checkDailyUsageLimit({
  teamId,
  maxRequests,
}: {
  teamId: string;
  maxRequests: number;
}): Promise<{ withinLimit: boolean; currentCount: number }> {
  const db = getDB();

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

export async function checkMonthlyBudgetLimit({
  teamId,
  monthlyBudgetUsd,
}: {
  teamId: string;
  monthlyBudgetUsd: number;
}): Promise<{ withinLimit: boolean; currentCostUsd: number }> {
  const db = getDB();
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const usage = await db
    .select({
      totalCost: sql<number>`sum(CAST(${aiUsageTable.estimatedCostUsd} AS REAL))`,
    })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.teamId, teamId),
        gte(aiUsageTable.createdAt, firstDayOfMonth),
      ),
    );

  const currentCostUsd = Number(usage[0]?.totalCost ?? 0);

  return {
    withinLimit: isWithinMonthlyBudget({ currentCostUsd, monthlyBudgetUsd }),
    currentCostUsd,
  };
}

export async function getMonthlyUsage(teamId: string): Promise<{
  totalRequests: number;
  totalCostUsd: number;
  budgetUsd: number;
  percentUsed: number;
}> {
  const db = getDB();

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
