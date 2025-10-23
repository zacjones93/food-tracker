"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { weeksTable, weekRecipesTable, groceryItemsTable, recipesTable, TEAM_PERMISSIONS, recipeRelationsTable, teamSettingsTable } from "@/db/schema";
import {
  createWeekSchema,
  updateWeekSchema,
  deleteWeekSchema,
  getWeekByIdSchema,
  addRecipeToWeekSchema,
  removeRecipeFromWeekSchema,
  reorderWeekRecipesSchema,
  toggleWeekRecipeMadeSchema,
} from "@/schemas/week.schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export const createWeekAction = createServerAction()
  .input(createWeekSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    // Require permission
    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.CREATE_SCHEDULES);

    const db = getDB();

    const [week] = await db.insert(weeksTable)
      .values({
        teamId: input.teamId,
        name: input.name,
        emoji: input.emoji,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        weekNumber: input.weekNumber,
      })
      .returning();

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${week.id}`);

    return { week };
  });

export const updateWeekAction = createServerAction()
  .input(updateWeekSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();
    const { id, ...updateData } = input;

    // Get week to verify team ownership
    const existingWeek = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, id),
    });

    if (!existingWeek) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, existingWeek.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

    const [week] = await db.update(weeksTable)
      .set(updateData)
      .where(eq(weeksTable.id, id))
      .returning();

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${id}`);

    return { week };
  });

export const deleteWeekAction = createServerAction()
  .input(deleteWeekSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    const existingWeek = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, input.id),
    });

    if (!existingWeek) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, existingWeek.teamId, TEAM_PERMISSIONS.DELETE_SCHEDULES);

    await db.delete(weeksTable)
      .where(eq(weeksTable.id, input.id));

    return { success: true };
  });

export const getWeekByIdAction = createServerAction()
  .input(getWeekByIdSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

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
        groceryItems: {
          orderBy: (groceryItems, { asc }) => [asc(groceryItems.order)],
        },
      },
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, week.teamId, TEAM_PERMISSIONS.ACCESS_SCHEDULES);

    // Fetch related recipes for all recipes in the week
    const recipeIds = week.recipes.map((wr) => wr.recipe.id);
    if (recipeIds.length > 0) {
      const relatedRecipes = await db.query.recipeRelationsTable.findMany({
        where: inArray(recipeRelationsTable.mainRecipeId, recipeIds),
        with: {
          sideRecipe: true,
        },
        orderBy: (relations, { asc }) => [asc(relations.order)],
      });

      // Attach related recipes to each week recipe
      const weekWithRelations = {
        ...week,
        recipes: week.recipes.map((wr) => ({
          ...wr,
          recipe: {
            ...wr.recipe,
            relatedRecipes: relatedRecipes
              .filter((rel) => rel.mainRecipeId === wr.recipe.id)
              .map((rel) => ({
                ...rel.sideRecipe,
                relationType: rel.relationType,
                relationOrder: rel.order,
              })),
          },
        })),
      };

      return { week: weekWithRelations };
    }

    return { week };
  });

export const getWeeksAction = createServerAction()
  .handler(async () => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();

    // Verify user has access to this team
    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_SCHEDULES);

    // Only return weeks from active team
    const weeks = await db.query.weeksTable.findMany({
      where: eq(weeksTable.teamId, session.activeTeamId!),
      orderBy: (weeks, { desc }) => [desc(weeks.startDate)],
      with: {
        recipes: {
          with: {
            recipe: true,
          },
          orderBy: (weekRecipes, { asc }) => [asc(weekRecipes.order)],
        },
      },
    });

    // Fetch related recipes for all recipes across all weeks
    const allRecipeIds = weeks.flatMap((week) =>
      week.recipes.map((wr) => wr.recipe.id)
    );

    if (allRecipeIds.length > 0) {
      const relatedRecipes = await db.query.recipeRelationsTable.findMany({
        where: inArray(recipeRelationsTable.mainRecipeId, allRecipeIds),
        with: {
          sideRecipe: true,
        },
        orderBy: (relations, { asc }) => [asc(relations.order)],
      });

      // Attach related recipes to each week recipe
      const weeksWithRelations = weeks.map((week) => ({
        ...week,
        recipes: week.recipes.map((wr) => ({
          ...wr,
          recipe: {
            ...wr.recipe,
            relatedRecipes: relatedRecipes
              .filter((rel) => rel.mainRecipeId === wr.recipe.id)
              .map((rel) => ({
                ...rel.sideRecipe,
                relationType: rel.relationType,
                relationOrder: rel.order,
              })),
          },
        })),
      }));

      return { weeks: weeksWithRelations };
    }

    return { weeks };
  });

export const getCurrentAndUpcomingWeeksAction = createServerAction()
  .handler(async () => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();

    // Verify user has access to this team
    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_SCHEDULES);

    const weeks = await db.query.weeksTable.findMany({
      where: (weeks, { or, eq, and: andFn }) => andFn(
        eq(weeks.teamId, session.activeTeamId!),
        or(
          eq(weeks.status, 'current'),
          eq(weeks.status, 'upcoming')
        )
      ),
      orderBy: (weeks, { asc }) => [asc(weeks.startDate)],
    });

    return { weeks };
  });

export const getWeeksForRecipeAction = createServerAction()
  .input(z.object({ recipeId: z.string() }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();

    // Verify user has access to this team
    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_SCHEDULES);

    const weeks = await db.query.weeksTable.findMany({
      where: (weeks, { or, eq, and: andFn }) => andFn(
        eq(weeks.teamId, session.activeTeamId!),
        or(
          eq(weeks.status, 'current'),
          eq(weeks.status, 'upcoming')
        )
      ),
      orderBy: (weeks, { asc }) => [asc(weeks.startDate)],
      with: {
        recipes: {
          where: (weekRecipes, { eq }) => eq(weekRecipes.recipeId, input.recipeId),
        },
      },
    });

    // Transform to include hasRecipe flag
    const weeksWithFlag = weeks.map(week => ({
      ...week,
      hasRecipe: week.recipes.length > 0,
    }));

    return { weeks: weeksWithFlag };
  });

export const addRecipeToWeekAction = createServerAction()
  .input(addRecipeToWeekSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Get week to verify permission
    const week = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, input.weekId),
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

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

    // Get max order for this week to add at bottom
    const weekRecipes = await db.query.weekRecipesTable.findMany({
      where: eq(weekRecipesTable.weekId, input.weekId),
    });

    const maxOrder = weekRecipes.reduce((max, wr) => Math.max(max, wr.order ?? 0), -1);

    const [weekRecipe] = await db.insert(weekRecipesTable)
      .values({
        weekId: input.weekId,
        recipeId: input.recipeId,
        order: input.order ?? maxOrder + 1,
      })
      .returning();

    // Check team settings to see if we should auto-add ingredients
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, week.teamId),
    });

    // Only add ingredients if team setting is enabled (defaults to true if not set)
    const shouldAutoAddIngredients = teamSettings?.autoAddIngredientsToGrocery ?? true;

    if (shouldAutoAddIngredients) {
      // Get recipe with ingredients
      const recipe = await db.query.recipesTable.findFirst({
        where: eq(recipesTable.id, input.recipeId),
      });

      // Add ingredients to grocery list if recipe has ingredients
      if (recipe?.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
        // Get current grocery items to calculate max order
        const existingGroceryItems = await db.query.groceryItemsTable.findMany({
          where: eq(groceryItemsTable.weekId, input.weekId),
        });

        const maxGroceryOrder = existingGroceryItems.reduce((max, item) => Math.max(max, item.order ?? 0), -1);

        let allIngredients: string[] = [];

        // Handle both old format (string[]) and new format (sections with items)
        if (recipe.ingredients.length > 0) {
          const firstItem = recipe.ingredients[0];
          if (typeof firstItem === "string") {
            // Old format: array of strings
            allIngredients = recipe.ingredients as unknown as string[];
          } else if (typeof firstItem === "object" && "items" in firstItem) {
            // New format: array of sections
            allIngredients = recipe.ingredients.flatMap((section: { items: string[] }) => section.items);
          }
        }

        // Insert each ingredient as a grocery item
        for (let i = 0; i < allIngredients.length; i++) {
          await db.insert(groceryItemsTable).values({
            weekId: input.weekId,
            name: allIngredients[i],
            checked: false,
            order: maxGroceryOrder + i + 1,
          });
        }
      }
    }

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${input.weekId}`);

    return { weekRecipe };
  });

export const removeRecipeFromWeekAction = createServerAction()
  .input(removeRecipeFromWeekSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Get week to verify permission
    const week = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, input.weekId),
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

    await db.delete(weekRecipesTable)
      .where(
        and(
          eq(weekRecipesTable.weekId, input.weekId),
          eq(weekRecipesTable.recipeId, input.recipeId)
        )
      );

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${input.weekId}`);

    return { success: true };
  });

export const reorderWeekRecipesAction = createServerAction()
  .input(reorderWeekRecipesSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Get week to verify permission
    const week = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, input.weekId),
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

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

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${input.weekId}`);

    return { success: true };
  });

export const toggleWeekRecipeMadeAction = createServerAction()
  .input(toggleWeekRecipeMadeSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Get week to verify permission
    const week = await db.query.weeksTable.findFirst({
      where: eq(weeksTable.id, input.weekId),
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

    // Update the made status
    const [weekRecipe] = await db.update(weekRecipesTable)
      .set({ made: input.made })
      .where(
        and(
          eq(weekRecipesTable.weekId, input.weekId),
          eq(weekRecipesTable.recipeId, input.recipeId)
        )
      )
      .returning();

    if (!weekRecipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found in this week");
    }

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${input.weekId}`);

    return { weekRecipe };
  });
