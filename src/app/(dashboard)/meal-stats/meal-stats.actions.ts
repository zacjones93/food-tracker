"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  recipesTable,
  weekRecipesTable,
  weeksTable,
  recipeBooksTable,
  TEAM_PERMISSIONS,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopRecipe {
  id: string;
  name: string;
  emoji: string | null;
  mealType: string | null;
  mealsEatenCount: number;
}

interface TopRecipeInPeriod {
  id: string;
  name: string;
  emoji: string | null;
  mealType: string | null;
  timesScheduled: number;
}

interface CookbookStat {
  id: string;
  name: string;
  recipeCount: number;
  totalMealsEaten: number;
}

interface TagCount {
  tag: string;
  count: number;
}

interface ForgottenFavorite {
  id: string;
  name: string;
  emoji: string | null;
  mealsEatenCount: number;
  lastMadeDate: Date | null;
  daysSinceLastMade: number | null;
}

interface WeeklyPlanningTrend {
  monthLabel: string;
  weeksCreated: number;
}

interface EmojiCount {
  emoji: string;
  count: number;
}

interface MealStats {
  // Meal frequency
  topRecipesAllTime: TopRecipe[];
  topRecipesThisYear: TopRecipeInPeriod[];
  topRecipesThisMonth: TopRecipeInPeriod[];
  topDinners: TopRecipe[];
  mostRepeatedInMonth: { recipe: TopRecipeInPeriod; month: string } | null;

  // Cooking patterns
  avgMealsPerWeek: number;
  newRecipesTriedThisYear: number;
  newRecipesTriedThisMonth: number;

  // Recipe book stats
  cookbookLeaderboard: CookbookStat[];

  topTags: TagCount[];

  // Time-based trends
  recipesAddedByMonth: WeeklyPlanningTrend[];
  forgottenFavorites: ForgottenFavorite[];
  weeklyPlanningByMonth: WeeklyPlanningTrend[];

  // Fun stats
  emojiLeaderboard: EmojiCount[];
  totalRecipes: number;
  totalWeeksPlanned: number;
  totalMealsEaten: number;
}

// ─── Helper functions ────────────────────────────────────────────────────────

function getStartOfYear(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}


// ─── Main action ─────────────────────────────────────────────────────────────

export const getMealStatsAction = createServerAction()
  .handler(async (): Promise<MealStats> => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();
    const teamId = session.activeTeamId;
    const startOfYear = getStartOfYear();
    const startOfMonth = getStartOfMonth();

    // ── Fetch core data ──────────────────────────────────────────────────────

    const [
      allRecipes,
      allWeeks,
      allWeekRecipes,
      allRecipeBooks,
    ] = await Promise.all([
      db.select().from(recipesTable).where(eq(recipesTable.teamId, teamId)),
      db.select().from(weeksTable).where(eq(weeksTable.teamId, teamId)),
      db.select({
        id: weekRecipesTable.id,
        weekId: weekRecipesTable.weekId,
        recipeId: weekRecipesTable.recipeId,
        scheduledDate: weekRecipesTable.scheduledDate,
        made: weekRecipesTable.made,
        order: weekRecipesTable.order,
        createdAt: weekRecipesTable.createdAt,
        weekStartDate: weeksTable.startDate,
      })
        .from(weekRecipesTable)
        .innerJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
        .where(eq(weeksTable.teamId, teamId)),
      db.select().from(recipeBooksTable),
    ]);

    // Build recipe lookup — only team recipes are in this map
    const recipeMap = new Map(allRecipes.map(r => [r.id, r]));

    // Filter recipe books to only those referenced by team recipes
    const teamBookIds = new Set(allRecipes.map(r => r.recipeBookId).filter(Boolean));
    const teamRecipeBooks = allRecipeBooks.filter(b => teamBookIds.has(b.id));

    // ── 1. Top recipes all time ──────────────────────────────────────────────

    const topRecipesAllTime = [...allRecipes]
      .sort((a, b) => b.mealsEatenCount - a.mealsEatenCount)
      .slice(0, 10)
      .map(r => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        mealType: r.mealType,
        mealsEatenCount: r.mealsEatenCount,
      }));

    // ── 2. Top recipes this year / month ─────────────────────────────────────

    function topRecipesInPeriod(after: Date): TopRecipeInPeriod[] {
      const counts = new Map<string, number>();
      for (const wr of allWeekRecipes) {
        if (!wr.made) continue;
        const date = wr.scheduledDate ? new Date(wr.scheduledDate) : (wr.weekStartDate ? new Date(wr.weekStartDate) : null);
        if (date && date >= after) {
          counts.set(wr.recipeId, (counts.get(wr.recipeId) || 0) + 1);
        }
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([recipeId, timesScheduled]) => {
          const r = recipeMap.get(recipeId);
          return {
            id: recipeId,
            name: r?.name || "Unknown",
            emoji: r?.emoji || null,
            mealType: r?.mealType || null,
            timesScheduled,
          };
        });
    }

    const topRecipesThisYear = topRecipesInPeriod(startOfYear);
    const topRecipesThisMonth = topRecipesInPeriod(startOfMonth);

    // ── 3. Top dinners ───────────────────────────────────────────────────────

    const topDinners = [...allRecipes]
      .filter(r => r.mealType?.toLowerCase() === "dinner")
      .sort((a, b) => b.mealsEatenCount - a.mealsEatenCount)
      .slice(0, 5)
      .map(r => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        mealType: r.mealType,
        mealsEatenCount: r.mealsEatenCount,
      }));

    // ── 4. Most repeated recipe in a single month ────────────────────────────

    const monthRecipeCounts = new Map<string, Map<string, number>>();
    for (const wr of allWeekRecipes) {
      if (!wr.made) continue;
      const rawDate = wr.scheduledDate ?? wr.weekStartDate;
      if (rawDate) {
        const d = new Date(rawDate);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthRecipeCounts.has(monthKey)) monthRecipeCounts.set(monthKey, new Map());
        const mc = monthRecipeCounts.get(monthKey)!;
        mc.set(wr.recipeId, (mc.get(wr.recipeId) || 0) + 1);
      }
    }

    let mostRepeatedInMonth: MealStats["mostRepeatedInMonth"] = null;
    let maxRepeat = 0;
    for (const [month, recipeCounts] of monthRecipeCounts) {
      for (const [recipeId, count] of recipeCounts) {
        if (count > maxRepeat) {
          maxRepeat = count;
          const r = recipeMap.get(recipeId);
          mostRepeatedInMonth = {
            recipe: {
              id: recipeId,
              name: r?.name || "Unknown",
              emoji: r?.emoji || null,
              mealType: r?.mealType || null,
              timesScheduled: count,
            },
            month,
          };
        }
      }
    }

    // ── Avg meals per week ─────────────────────────────────────────────────

    const weeksWithRecipes = new Set(allWeekRecipes.map(wr => wr.weekId)).size;
    const avgMealsPerWeek = weeksWithRecipes > 0
      ? Math.round((allWeekRecipes.length / weeksWithRecipes) * 10) / 10
      : 0;

    // ── 11. New recipes tried ────────────────────────────────────────────────

    const newRecipesTriedThisYear = allRecipes.filter(
      r => r.createdAt >= startOfYear && r.mealsEatenCount > 0
    ).length;

    const newRecipesTriedThisMonth = allRecipes.filter(
      r => r.createdAt >= startOfMonth && r.mealsEatenCount > 0
    ).length;

    // ── 12. Cookbook leaderboard ──────────────────────────────────────────────

    const bookStats = new Map<string, { recipeCount: number; totalMealsEaten: number }>();
    for (const recipe of allRecipes) {
      if (!recipe.recipeBookId) continue;
      const existing = bookStats.get(recipe.recipeBookId) || { recipeCount: 0, totalMealsEaten: 0 };
      existing.recipeCount++;
      existing.totalMealsEaten += recipe.mealsEatenCount;
      bookStats.set(recipe.recipeBookId, existing);
    }

    const bookMap = new Map(teamRecipeBooks.map(b => [b.id, b.name]));
    const cookbookLeaderboard = [...bookStats.entries()]
      .sort((a, b) => b[1].totalMealsEaten - a[1].totalMealsEaten)
      .map(([bookId, stats]) => ({
        id: bookId,
        name: bookMap.get(bookId) || "Unknown",
        recipeCount: stats.recipeCount,
        totalMealsEaten: stats.totalMealsEaten,
      }));

    // ── Top tags ──────────────────────────────────────────────────────────────

    const tagCounts = new Map<string, number>();
    for (const recipe of allRecipes) {
      const tags = recipe.tags as string[] | null;
      if (!tags) continue;
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));

    // ── Recipes added by month ─────────────────────────────────────────────

    const recipesByMonth = new Map<string, number>();
    for (const recipe of allRecipes) {
      const d = new Date(recipe.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      recipesByMonth.set(key, (recipesByMonth.get(key) || 0) + 1);
    }
    const recipesAddedByMonth = [...recipesByMonth.entries()]
      .sort()
      .map(([monthLabel, weeksCreated]) => ({ monthLabel, weeksCreated }));

    // ── 18. Forgotten favorites ──────────────────────────────────────────────

    const now = new Date();
    const forgottenFavorites = allRecipes
      .filter(r => r.mealsEatenCount >= 1 && r.lastMadeDate)
      .map(r => {
        const lastMade = r.lastMadeDate ? new Date(r.lastMadeDate) : null;
        const daysSinceLastMade = lastMade
          ? Math.floor((now.getTime() - lastMade.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          id: r.id,
          name: r.name,
          emoji: r.emoji,
          mealsEatenCount: r.mealsEatenCount,
          lastMadeDate: r.lastMadeDate,
          daysSinceLastMade,
        };
      })
      .filter(r => r.daysSinceLastMade !== null && r.daysSinceLastMade > 60)
      .sort((a, b) => (b.daysSinceLastMade || 0) - (a.daysSinceLastMade || 0))
      .slice(0, 10);

    // ── 19. Weekly planning by month ─────────────────────────────────────────

    const weeksByMonth = new Map<string, number>();
    for (const week of allWeeks) {
      const d = new Date(week.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      weeksByMonth.set(key, (weeksByMonth.get(key) || 0) + 1);
    }
    const weeklyPlanningByMonth = [...weeksByMonth.entries()]
      .sort()
      .map(([monthLabel, weeksCreated]) => ({ monthLabel, weeksCreated }));

    // ── 20. Emoji leaderboard ────────────────────────────────────────────────

    const emojiCounts = new Map<string, number>();
    for (const recipe of allRecipes) {
      if (recipe.emoji) {
        emojiCounts.set(recipe.emoji, (emojiCounts.get(recipe.emoji) || 0) + 1);
      }
    }
    const emojiLeaderboard = [...emojiCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([emoji, count]) => ({ emoji, count }));

    // ── Summary totals ────────────────────────────────────────────────────────

    const totalRecipes = allRecipes.length;
    const totalWeeksPlanned = allWeeks.length;
    const totalMealsEaten = allRecipes.reduce((sum, r) => sum + r.mealsEatenCount, 0);

    return {
      topRecipesAllTime,
      topRecipesThisYear,
      topRecipesThisMonth,
      topDinners,
      mostRepeatedInMonth,
      avgMealsPerWeek,
      newRecipesTriedThisYear,
      newRecipesTriedThisMonth,
      cookbookLeaderboard,
      topTags,
      recipesAddedByMonth,
      forgottenFavorites,
      weeklyPlanningByMonth,
      emojiLeaderboard,
      totalRecipes,
      totalWeeksPlanned,
      totalMealsEaten,
    };
  });
