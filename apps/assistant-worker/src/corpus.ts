import type {
  RecipeRetrievalRecord,
  RetrievalContext,
  RetrievalCorpus,
  RetrievalCorpusProvider,
  WeekRecipeRetrievalRecord,
  WeekRetrievalRecord,
} from "../../web/src/lib/ai/retrieval/types";

interface RawRecipeRecord extends Omit<RecipeRetrievalRecord, "tags" | "ingredients"> {
  tags: string | null;
  ingredients: string | null;
}

interface RawWeekRecipeRecord extends Omit<WeekRecipeRetrievalRecord, "made"> {
  made: number;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const workerRetrievalCorpusProvider: RetrievalCorpusProvider<D1Database> = {
  async load(context) {
    return loadWorkerRetrievalCorpus(context);
  },
};

export async function loadWorkerRetrievalCorpus(
  context: RetrievalContext<D1Database>,
): Promise<RetrievalCorpus> {
  const [recipeResult, weekResult, weekRecipeResult] = await Promise.all([
    context.db.prepare(
      `SELECT id, teamId, name, emoji, tags, mealType, difficulty, visibility,
              recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount,
              ingredients, recipeBody
         FROM recipes WHERE teamId = ?`,
    ).bind(context.teamId).all<RawRecipeRecord>(),
    context.db.prepare(
      `SELECT id, teamId, name, emoji, status, startDate, endDate, weekNumber
         FROM weeks WHERE teamId = ?`,
    ).bind(context.teamId).all<WeekRetrievalRecord>(),
    context.db.prepare(
      `SELECT wr.id, wr.weekId, wr.recipeId, wr.scheduledDate, wr."order", wr.made
         FROM week_recipes wr
         JOIN weeks w ON w.id = wr.weekId
         JOIN recipes r ON r.id = wr.recipeId
        WHERE w.teamId = ? AND r.teamId = ?`,
    ).bind(context.teamId, context.teamId).all<RawWeekRecipeRecord>(),
  ]);

  return {
    recipes: recipeResult.results.map((recipe) => ({
      ...recipe,
      tags: parseJson(recipe.tags),
      ingredients: parseJson(recipe.ingredients),
    })),
    weeks: weekResult.results,
    weekRecipes: weekRecipeResult.results.map((weekRecipe) => ({
      ...weekRecipe,
      made: weekRecipe.made === 1,
    })),
  };
}
