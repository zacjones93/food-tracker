"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { weeksTable, weekRecipesTable } from "@/db/schema";
import {
  createWeekSchema,
  updateWeekSchema,
  deleteWeekSchema,
  getWeekByIdSchema,
  addRecipeToWeekSchema,
  removeRecipeFromWeekSchema,
  reorderWeekRecipesSchema,
} from "@/schemas/week.schema";
import { eq, and } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";

export const createWeekAction = createServerAction()
  .input(createWeekSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const [week] = await db.insert(weeksTable)
      .values({
        name: input.name,
        emoji: input.emoji,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        weekNumber: input.weekNumber,
      })
      .returning();

    return { week };
  });

export const updateWeekAction = createServerAction()
  .input(updateWeekSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { id, ...updateData } = input;

    const [week] = await db.update(weeksTable)
      .set(updateData)
      .where(eq(weeksTable.id, id))
      .returning();

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    return { week };
  });

export const deleteWeekAction = createServerAction()
  .input(deleteWeekSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    await db.delete(weeksTable)
      .where(eq(weeksTable.id, input.id));

    return { success: true };
  });

export const getWeekByIdAction = createServerAction()
  .input(getWeekByIdSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const week = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, input.id),
      with: {
        recipes: {
          with: {
            recipe: true,
          },
          orderBy: (weekRecipes, { asc }) => [asc(weekRecipes.order)],
        },
      },
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    return { week };
  });

export const getWeeksAction = createServerAction()
  .handler(async () => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const weeks = await db.query.weeksTable.findMany({
      orderBy: (weeks, { desc }) => [desc(weeks.startDate)],
      with: {
        recipes: {
          with: {
            recipe: true,
          },
        },
      },
    });

    return { weeks };
  });

export const addRecipeToWeekAction = createServerAction()
  .input(addRecipeToWeekSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Check if recipe is already in week
    const existing = await db.query.weekRecipesTable.findFirst({
      where: and(
        eq(weekRecipesTable.weekId, input.weekId),
        eq(weekRecipesTable.recipeId, input.recipeId)
      ),
    });

    if (existing) {
      throw new ZSAError("CONFLICT", "Recipe is already in this week");
    }

    const [weekRecipe] = await db.insert(weekRecipesTable)
      .values({
        weekId: input.weekId,
        recipeId: input.recipeId,
        order: input.order ?? 0,
      })
      .returning();

    return { weekRecipe };
  });

export const removeRecipeFromWeekAction = createServerAction()
  .input(removeRecipeFromWeekSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    await db.delete(weekRecipesTable)
      .where(
        and(
          eq(weekRecipesTable.weekId, input.weekId),
          eq(weekRecipesTable.recipeId, input.recipeId)
        )
      );

    return { success: true };
  });

export const reorderWeekRecipesAction = createServerAction()
  .input(reorderWeekRecipesSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Update order for each recipe
    for (let i = 0; i < input.recipeIds.length; i++) {
      await db.update(weekRecipesTable)
        .set({ order: i })
        .where(
          and(
            eq(weekRecipesTable.weekId, input.weekId),
            eq(weekRecipesTable.recipeId, input.recipeIds[i])
          )
        );
    }

    return { success: true };
  });
