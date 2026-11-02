import { and, eq, inArray, sql } from "drizzle-orm";
import type { getDB } from "../db";
import { recipesTable, weekRecipesTable, weeksTable } from "../db/schema";

// Keep the list contract separate from the full recipe used by detail/edit views.
export const recipeListColumns = {
  id: recipesTable.id,
  name: recipesTable.name,
  emoji: recipesTable.emoji,
  mealType: recipesTable.mealType,
  difficulty: recipesTable.difficulty,
  tags: recipesTable.tags,
  createdAt: recipesTable.createdAt,
};

export interface RecipeListItem {
  id: string;
  name: string;
  emoji: string | null;
  mealType: string | null;
  difficulty: string | null;
  tags: string[] | null;
  createdAt: Date;
  mealsEatenCount: number;
  latestWeekId: string | null;
  latestWeekName: string | null;
}

export interface RecipeScheduleStats {
  weekCount: number;
  latestWeekId: string | null;
  latestWeekName: string | null;
}

export function recipeScheduleStatsQuery({ db, teamId, recipeIds }: {
  db: ReturnType<typeof getDB>;
  teamId: string;
  recipeIds: string[];
}) {
  return db.select({
    recipeId: weekRecipesTable.recipeId,
    weekCount: sql<number>`count(distinct ${weekRecipesTable.weekId})`,
    // SQLite's single MAX aggregate selects the other columns from its winning row.
    // Coalesce handles schedules whose start dates are all NULL too.
    latestStart: sql<number>`max(coalesce(${weeksTable.startDate}, -9223372036854775808))`,
    latestWeekId: weeksTable.id,
    latestWeekName: weeksTable.name,
  }).from(weekRecipesTable)
    .innerJoin(weeksTable, eq(weeksTable.id, weekRecipesTable.weekId))
    .where(and(eq(weeksTable.teamId, teamId),
      // One JSON parameter also handles the all-recipes client search page without
      // exceeding D1's bound-parameter limit.
      inArray(weekRecipesTable.recipeId, sql`(select value from json_each(${JSON.stringify(recipeIds)}))`)))
    .groupBy(weekRecipesTable.recipeId);
}

export async function getRecipeScheduleStats(input: Parameters<typeof recipeScheduleStatsQuery>[0]) {
  if (!input.recipeIds.length) return new Map<string, RecipeScheduleStats>();
  const rows = await recipeScheduleStatsQuery(input);
  return new Map(rows.map(row => [row.recipeId, {
    weekCount: row.weekCount,
    latestWeekId: row.latestWeekId,
    latestWeekName: row.latestWeekName,
  }]));
}
