"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import {
  recipesTable,
  weekRecipesTable,
  weeksTable,
  recipeBooksTable,
  groceryItemsTable,
  recipeRelationsTable,
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

interface IngredientCount {
  name: string;
  count: number;
}

interface GroceryItemCount {
  name: string;
  count: number;
  category: string | null;
}

interface CookbookStat {
  id: string;
  name: string;
  recipeCount: number;
  totalMealsEaten: number;
}

interface MealTypeBreakdown {
  mealType: string;
  count: number;
}

interface DifficultyBreakdown {
  difficulty: string;
  count: number;
}

interface TagCount {
  tag: string;
  count: number;
}

interface RecipePairing {
  mainId: string;
  mainName: string;
  mainEmoji: string | null;
  sideId: string;
  sideName: string;
  sideEmoji: string | null;
  relationType: string;
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

  // Ingredients
  mostUsedIngredients: IngredientCount[];
  mostPurchasedGroceryItems: GroceryItemCount[];
  topGroceryByCategory: Record<string, GroceryItemCount[]>;
  alwaysOnTheList: GroceryItemCount[];

  // Cooking patterns
  busiestCookingDay: { day: string; count: number } | null;
  avgMealsPerWeek: number;
  newRecipesTriedThisYear: number;
  newRecipesTriedThisMonth: number;

  // Recipe book stats
  cookbookLeaderboard: CookbookStat[];

  // Meal type & difficulty breakdown
  mealTypeBreakdown: MealTypeBreakdown[];
  difficultyBreakdown: DifficultyBreakdown[];
  topTags: TagCount[];

  // Pairings
  mostPopularSides: TopRecipe[];
  favoritePairings: RecipePairing[];

  // Time-based trends
  recipesAddedByMonth: WeeklyPlanningTrend[];
  forgottenFavorites: ForgottenFavorite[];
  weeklyPlanningByMonth: WeeklyPlanningTrend[];

  // Fun stats
  emojiLeaderboard: EmojiCount[];
  avgGroceryListLength: number;
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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalizeIngredient(raw: string): string {
  // Strip leading quantities/measurements and normalize
  return raw
    .replace(/^[\d½¼¾⅓⅔⅛/.\s-]+/, "")
    .replace(/^(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|cloves?|cans?|pieces?|inch|large|medium|small|bunch|head|pinch|dash)\b\s*/gi, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim()
    .toLowerCase();
}

// ─── Main action ─────────────────────────────────────────────────────────────

export const getMealStatsAction = createServerAction()
  .input(z.object({}).optional())
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
      allGroceryItems,
      allRelations,
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
      })
        .from(weekRecipesTable)
        .innerJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
        .where(eq(weeksTable.teamId, teamId)),
      db.select()
        .from(groceryItemsTable)
        .innerJoin(weeksTable, eq(groceryItemsTable.weekId, weeksTable.id))
        .where(eq(weeksTable.teamId, teamId)),
      db.select({
        mainRecipeId: recipeRelationsTable.mainRecipeId,
        sideRecipeId: recipeRelationsTable.sideRecipeId,
        relationType: recipeRelationsTable.relationType,
      })
        .from(recipeRelationsTable)
        .innerJoin(recipesTable, eq(recipeRelationsTable.mainRecipeId, recipesTable.id))
        .where(eq(recipesTable.teamId, teamId)),
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
        if (wr.scheduledDate && new Date(wr.scheduledDate) >= after && wr.made) {
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
      if (wr.scheduledDate && wr.made) {
        const d = new Date(wr.scheduledDate);
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

    // ── 5. Most used ingredients (from recipe definitions) ───────────────────

    const ingredientCounts = new Map<string, number>();
    for (const recipe of allRecipes) {
      if (!recipe.ingredients) continue;
      const sections = recipe.ingredients as Array<{ title?: string; items: string[] }>;
      for (const section of sections) {
        for (const item of section.items) {
          const normalized = normalizeIngredient(item);
          if (normalized.length > 1) {
            ingredientCounts.set(normalized, (ingredientCounts.get(normalized) || 0) + 1);
          }
        }
      }
    }

    const mostUsedIngredients = [...ingredientCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    // ── 6. Most purchased grocery items ──────────────────────────────────────

    const groceryCounts = new Map<string, { count: number; category: string | null }>();
    for (const row of allGroceryItems) {
      const item = row.grocery_items;
      const key = item.name.toLowerCase().trim();
      const existing = groceryCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        groceryCounts.set(key, { count: 1, category: item.category });
      }
    }

    const mostPurchasedGroceryItems = [...groceryCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([name, data]) => ({ name, count: data.count, category: data.category }));

    // ── 7. Top grocery by category ───────────────────────────────────────────

    const topGroceryByCategory: Record<string, GroceryItemCount[]> = {};
    const categoryGroups = new Map<string, Map<string, number>>();
    for (const row of allGroceryItems) {
      const item = row.grocery_items;
      const cat = item.category || "Uncategorized";
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, new Map());
      const catMap = categoryGroups.get(cat)!;
      const key = item.name.toLowerCase().trim();
      catMap.set(key, (catMap.get(key) || 0) + 1);
    }
    for (const [cat, items] of categoryGroups) {
      topGroceryByCategory[cat] = [...items.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count, category: cat }));
    }

    // ── 8. "Always on the list" (items appearing in >80% of weeks) ──────────

    const totalWeeksWithGroceries = new Set(allGroceryItems.map(r => r.grocery_items.weekId)).size;
    const itemWeekCounts = new Map<string, Set<string>>();
    for (const row of allGroceryItems) {
      const item = row.grocery_items;
      const key = item.name.toLowerCase().trim();
      if (!itemWeekCounts.has(key)) itemWeekCounts.set(key, new Set());
      itemWeekCounts.get(key)!.add(item.weekId);
    }

    const threshold = totalWeeksWithGroceries * 0.5; // 50% is more useful than 80% for smaller datasets
    const alwaysOnTheList = [...itemWeekCounts.entries()]
      .filter(([, weeks]) => weeks.size >= threshold && threshold > 0)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 10)
      .map(([name, weeks]) => ({
        name,
        count: weeks.size,
        category: groceryCounts.get(name)?.category || null,
      }));

    // ── 9. Busiest cooking day ───────────────────────────────────────────────

    const dayCounts = new Array(7).fill(0);
    for (const wr of allWeekRecipes) {
      if (wr.scheduledDate) {
        const d = new Date(wr.scheduledDate);
        dayCounts[d.getDay()]++;
      }
    }
    const maxDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const busiestCookingDay = dayCounts[maxDayIdx] > 0
      ? { day: DAY_NAMES[maxDayIdx], count: dayCounts[maxDayIdx] }
      : null;

    // ── 10. Avg meals per week ───────────────────────────────────────────────

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

    // ── 13. Meal type breakdown ──────────────────────────────────────────────

    const mealTypeCounts = new Map<string, number>();
    for (const recipe of allRecipes) {
      const type = recipe.mealType || "Unspecified";
      mealTypeCounts.set(type, (mealTypeCounts.get(type) || 0) + 1);
    }
    const mealTypeBreakdown = [...mealTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mealType, count]) => ({ mealType, count }));

    // ── 14. Difficulty breakdown ─────────────────────────────────────────────

    const difficultyCounts = new Map<string, number>();
    for (const recipe of allRecipes) {
      const diff = recipe.difficulty || "Unspecified";
      difficultyCounts.set(diff, (difficultyCounts.get(diff) || 0) + 1);
    }
    const difficultyBreakdown = [...difficultyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([difficulty, count]) => ({ difficulty, count }));

    // ── 15. Top tags ─────────────────────────────────────────────────────────

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

    // ── 16. Most popular sides & favorite pairings ───────────────────────────

    const sidePopularity = new Map<string, number>();
    for (const rel of allRelations) {
      sidePopularity.set(rel.sideRecipeId, (sidePopularity.get(rel.sideRecipeId) || 0) + 1);
    }

    const mostPopularSides = [...sidePopularity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([recipeId, count]) => {
        const r = recipeMap.get(recipeId);
        return {
          id: recipeId,
          name: r?.name || "Unknown",
          emoji: r?.emoji || null,
          mealType: r?.mealType || null,
          mealsEatenCount: count,
        };
      });

    const favoritePairings = allRelations
      .slice(0, 10)
      .map(rel => {
        const main = recipeMap.get(rel.mainRecipeId);
        const side = recipeMap.get(rel.sideRecipeId);
        return {
          mainId: rel.mainRecipeId,
          mainName: main?.name || "Unknown",
          mainEmoji: main?.emoji || null,
          sideId: rel.sideRecipeId,
          sideName: side?.name || "Unknown",
          sideEmoji: side?.emoji || null,
          relationType: rel.relationType,
        };
      });

    // ── 17. Recipes added by month ───────────────────────────────────────────

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
      .filter(r => r.mealsEatenCount >= 3 && r.lastMadeDate)
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

    // ── 21. Avg grocery list length ──────────────────────────────────────────

    const groceryCountPerWeek = new Map<string, number>();
    for (const row of allGroceryItems) {
      const weekId = row.grocery_items.weekId;
      groceryCountPerWeek.set(weekId, (groceryCountPerWeek.get(weekId) || 0) + 1);
    }
    const avgGroceryListLength = groceryCountPerWeek.size > 0
      ? Math.round([...groceryCountPerWeek.values()].reduce((a, b) => a + b, 0) / groceryCountPerWeek.size * 10) / 10
      : 0;

    // ── 22. Summary totals ───────────────────────────────────────────────────

    const totalRecipes = allRecipes.length;
    const totalWeeksPlanned = allWeeks.length;
    const totalMealsEaten = allRecipes.reduce((sum, r) => sum + r.mealsEatenCount, 0);

    return {
      topRecipesAllTime,
      topRecipesThisYear,
      topRecipesThisMonth,
      topDinners,
      mostRepeatedInMonth,
      mostUsedIngredients,
      mostPurchasedGroceryItems,
      topGroceryByCategory,
      alwaysOnTheList,
      busiestCookingDay,
      avgMealsPerWeek,
      newRecipesTriedThisYear,
      newRecipesTriedThisMonth,
      cookbookLeaderboard,
      mealTypeBreakdown,
      difficultyBreakdown,
      topTags,
      mostPopularSides,
      favoritePairings,
      recipesAddedByMonth,
      forgottenFavorites,
      weeklyPlanningByMonth,
      emojiLeaderboard,
      avgGroceryListLength,
      totalRecipes,
      totalWeeksPlanned,
      totalMealsEaten,
    };
  });
