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
} from "@/schemas/recipe.schema";
import { eq } from "drizzle-orm";
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
  .handler(async () => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const recipes = await db.query.recipesTable.findMany({
      orderBy: (recipes, { desc }) => [desc(recipes.createdAt)],
    });

    return { recipes };
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
