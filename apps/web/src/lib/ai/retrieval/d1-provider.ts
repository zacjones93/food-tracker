import "server-only";

import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "@/db/schema";
import { recipesTable, weekRecipesTable, weeksTable } from "@/db/schema";

import { createRetrievalService, type RetrievalService } from "./service";
import type {
  RetrievalContext,
  RetrievalCorpus,
  RetrievalCorpusProvider,
} from "./types";

type AppDatabase = DrizzleD1Database<typeof schema>;

export const d1RetrievalCorpusProvider: RetrievalCorpusProvider<AppDatabase> = {
  async load(context) {
    return loadD1RetrievalCorpus(context);
  },
};

export function createD1RetrievalService(
  context: RetrievalContext<AppDatabase>,
): RetrievalService {
  return createRetrievalService({ context, provider: d1RetrievalCorpusProvider });
}

async function loadD1RetrievalCorpus(
  context: RetrievalContext<AppDatabase>,
): Promise<RetrievalCorpus> {
  const [recipes, weeks, weekRecipes] = await Promise.all([
    context.db
      .select({
        id: recipesTable.id,
        teamId: recipesTable.teamId,
        name: recipesTable.name,
        emoji: recipesTable.emoji,
        tags: recipesTable.tags,
        mealType: recipesTable.mealType,
        difficulty: recipesTable.difficulty,
        visibility: recipesTable.visibility,
        recipeLink: recipesTable.recipeLink,
        recipeBookId: recipesTable.recipeBookId,
        page: recipesTable.page,
        lastMadeDate: recipesTable.lastMadeDate,
        mealsEatenCount: recipesTable.mealsEatenCount,
        ingredients: recipesTable.ingredients,
        recipeBody: recipesTable.recipeBody,
      })
      .from(recipesTable)
      .where(eq(recipesTable.teamId, context.teamId)),
    context.db
      .select({
        id: weeksTable.id,
        teamId: weeksTable.teamId,
        name: weeksTable.name,
        emoji: weeksTable.emoji,
        status: weeksTable.status,
        startDate: weeksTable.startDate,
        endDate: weeksTable.endDate,
        weekNumber: weeksTable.weekNumber,
      })
      .from(weeksTable)
      .where(eq(weeksTable.teamId, context.teamId)),
    context.db
      .select({
        id: weekRecipesTable.id,
        weekId: weekRecipesTable.weekId,
        recipeId: weekRecipesTable.recipeId,
        scheduledDate: weekRecipesTable.scheduledDate,
        order: weekRecipesTable.order,
        made: weekRecipesTable.made,
      })
      .from(weekRecipesTable)
      .innerJoin(weeksTable, eq(weeksTable.id, weekRecipesTable.weekId))
      .innerJoin(recipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
      .where(
        and(
          eq(weeksTable.teamId, context.teamId),
          eq(recipesTable.teamId, context.teamId),
        ),
      ),
  ]);

  return { recipes, weeks, weekRecipes };
}
