"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { recipesTable } from "@/db/schema";
import {
  createRecipeSchema,
  updateRecipeSchema,
  deleteRecipeSchema,
  getRecipeByIdSchema,
  incrementMealsEatenSchema,
  getRecipesSchema,
} from "@/schemas/recipe.schema";
import { eq, and, gte, lte, like, sql, or } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";

export const createRecipeAction = createServerAction()
  .input(createRecipeSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const [recipe] = await db.insert(recipesTable)
      .values({
        name: input.name,
        emoji: input.emoji,
        tags: input.tags,
        mealType: input.mealType,
        difficulty: input.difficulty,
        ingredients: input.ingredients,
        recipeBody: input.recipeBody,
      })
      .returning();

    return { recipe };
  });

export const updateRecipeAction = createServerAction()
  .input(updateRecipeSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { id, ...updateData } = input;

    const [recipe] = await db.update(recipesTable)
      .set(updateData)
      .where(eq(recipesTable.id, id))
      .returning();

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    return { recipe };
  });

export const deleteRecipeAction = createServerAction()
  .input(deleteRecipeSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    await db.delete(recipesTable)
      .where(eq(recipesTable.id, input.id));

    return { success: true };
  });

export const getRecipeByIdAction = createServerAction()
  .input(getRecipeByIdSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const recipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, input.id),
    });

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    return { recipe };
  });

export const getRecipesAction = createServerAction()
  .input(getRecipesSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { search, page, limit, mealType, difficulty, tags, minMealsEaten, maxMealsEaten } = input;

    // Build WHERE conditions
    const conditions = [];

    if (search) {
      conditions.push(like(recipesTable.name, `%${search}%`));
    }

    if (mealType) {
      conditions.push(eq(recipesTable.mealType, mealType));
    }

    if (difficulty) {
      conditions.push(eq(recipesTable.difficulty, difficulty));
    }

    if (minMealsEaten !== undefined) {
      conditions.push(gte(recipesTable.mealsEatenCount, minMealsEaten));
    }

    if (maxMealsEaten !== undefined) {
      conditions.push(lte(recipesTable.mealsEatenCount, maxMealsEaten));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch all matching recipes (before pagination)
    let allRecipes = await db
      .select()
      .from(recipesTable)
      .where(whereClause)
      .orderBy(recipesTable.name);

    // Filter by tags in memory (since JSON filtering is complex in SQLite/D1)
    // Must be done BEFORE pagination to get correct counts
    if (tags && tags.length > 0) {
      allRecipes = allRecipes.filter(recipe =>
        recipe.tags && tags.some(tag => recipe.tags?.includes(tag))
      );
    }

    // Get total count after tag filtering
    const total = allRecipes.length;

    // Apply pagination to filtered results
    const recipes = allRecipes.slice((page - 1) * limit, page * limit);

    return {
      recipes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    };
  });

export const incrementMealsEatenAction = createServerAction()
  .input(incrementMealsEatenSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const recipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, input.id),
    });

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    const [updatedRecipe] = await db.update(recipesTable)
      .set({
        mealsEatenCount: (recipe.mealsEatenCount || 0) + 1,
        lastMadeDate: new Date(),
      })
      .where(eq(recipesTable.id, input.id))
      .returning();

    return { recipe: updatedRecipe };
  });
