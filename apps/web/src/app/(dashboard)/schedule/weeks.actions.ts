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
  updateWeekRecipeScheduledDateSchema,
} from "@/schemas/week.schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { hasAccessToRecipe } from "@/utils/recipe-visibility";
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
                relationId: rel.id,
                relationType: rel.relationType,
                relationOrder: rel.order,
                scheduleLeadDays: rel.scheduleLeadDays,
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

    // Fetch related recipes ONLY for current/upcoming weeks (not archived)
    const currentAndUpcomingRecipeIds = weeks
      .filter((week) => week.status === 'current' || week.status === 'upcoming')
      .flatMap((week) => week.recipes.map((wr) => wr.recipe.id));

    if (currentAndUpcomingRecipeIds.length > 0) {
      const relatedRecipes = await db.query.recipeRelationsTable.findMany({
        where: inArray(recipeRelationsTable.mainRecipeId, currentAndUpcomingRecipeIds),
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
                relationId: rel.id,
                relationType: rel.relationType,
                relationOrder: rel.order,
                scheduleLeadDays: rel.scheduleLeadDays,
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

    // Transform to include recipe count
    const weeksWithFlag = weeks.map(week => ({
      ...week,
      recipeCount: week.recipes.length,
    }));

    return { weeks: weeksWithFlag };
  });

export const getSchedulePreparationOptionsAction = createServerAction()
  .input(z.object({ recipeId: z.string() }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.ACCESS_SCHEDULES,
    );

    const db = getDB();
    const recipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, input.recipeId),
    });

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    const canAccessRecipe = await hasAccessToRecipe(
      recipe,
      session.user.id,
      session.activeTeamId,
    );
    if (!canAccessRecipe) {
      throw new ZSAError("FORBIDDEN", "You don't have access to this recipe");
    }

    const relations = await db.query.recipeRelationsTable.findMany({
      where: and(
        eq(recipeRelationsTable.mainRecipeId, input.recipeId),
        isNotNull(recipeRelationsTable.scheduleLeadDays),
      ),
      with: { sideRecipe: true },
      orderBy: (table, { asc }) => [asc(table.order)],
    });

    return {
      preparations: relations.map((relation) => ({
        recipeRelationId: relation.id,
        recipeId: relation.sideRecipeId,
        name: relation.sideRecipe.name,
        emoji: relation.sideRecipe.emoji,
        relationType: relation.relationType,
        scheduleLeadDays: relation.scheduleLeadDays ?? 0,
      })),
    };
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

    const preparationInputs = input.preparations ?? [];
    const preparationRelationIds = preparationInputs.map(
      (preparation) => preparation.recipeRelationId,
    );
    const preparationRelations = preparationRelationIds.length > 0
      ? await db.query.recipeRelationsTable.findMany({
          where: inArray(recipeRelationsTable.id, preparationRelationIds),
        })
      : [];
    const preparationRelationsById = new Map(
      preparationRelations.map((relation) => [relation.id, relation]),
    );

    for (const preparation of preparationInputs) {
      const relation = preparationRelationsById.get(preparation.recipeRelationId);
      if (
        !relation ||
        relation.mainRecipeId !== input.recipeId ||
        relation.sideRecipeId !== preparation.recipeId ||
        relation.scheduleLeadDays == null
      ) {
        throw new ZSAError("INPUT_PARSE_ERROR", "Invalid preparation recipe selection");
      }
    }

    const recipeIds = [input.recipeId, ...preparationInputs.map((preparation) => preparation.recipeId)];
    const recipes = await db.query.recipesTable.findMany({
      where: inArray(recipesTable.id, recipeIds),
    });
    if (recipes.length !== new Set(recipeIds).size) {
      throw new ZSAError("NOT_FOUND", "One or more recipes were not found");
    }

    const canAccessRecipes = await Promise.all(
      recipes.map((recipe) => hasAccessToRecipe(recipe, user.id, week.teamId)),
    );
    if (canAccessRecipes.some((hasAccess) => !hasAccess)) {
      throw new ZSAError("FORBIDDEN", "You don't have access to one or more recipes");
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
        scheduledDate: input.scheduledDate,
      })
      .returning();

    const preparationWeekRecipes: Array<typeof weekRecipe> = [];
    for (let index = 0; index < preparationInputs.length; index++) {
      const preparation = preparationInputs[index];
      const [preparationWeekRecipe] = await db.insert(weekRecipesTable)
        .values({
          weekId: input.weekId,
          recipeId: preparation.recipeId,
          scheduledForWeekRecipeId: weekRecipe.id,
          sourceRecipeRelationId: preparation.recipeRelationId,
          order: maxOrder + index + 2,
          scheduledDate: preparation.scheduledDate,
        })
        .returning();
      preparationWeekRecipes.push(preparationWeekRecipe);
    }

    // Check team settings to see if we should auto-add ingredients
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, week.teamId),
    });

    // Only add ingredients if team setting is enabled (defaults to true if not set)
    const shouldAutoAddIngredients = teamSettings?.autoAddIngredientsToGrocery ?? true;

    if (shouldAutoAddIngredients) {
      const existingGroceryItems = await db.query.groceryItemsTable.findMany({
        where: eq(groceryItemsTable.weekId, input.weekId),
      });
      let nextGroceryOrder = existingGroceryItems.reduce(
        (max, item) => Math.max(max, item.order ?? 0),
        -1,
      ) + 1;

      for (const recipe of recipes) {
        if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) continue;

        let ingredients: string[] = [];
        const firstIngredient = recipe.ingredients[0];
        if (typeof firstIngredient === "string") {
          ingredients = recipe.ingredients as unknown as string[];
        } else if (typeof firstIngredient === "object" && firstIngredient && "items" in firstIngredient) {
          ingredients = recipe.ingredients.flatMap((section: { items: string[] }) => section.items);
        }

        for (const ingredient of ingredients) {
          await db.insert(groceryItemsTable).values({
            weekId: input.weekId,
            name: ingredient,
            checked: false,
            order: nextGroceryOrder,
          });
          nextGroceryOrder += 1;
        }
      }
    }

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${input.weekId}`);

    return { weekRecipe, preparationWeekRecipes };
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

    // Get week recipe to verify permission
    const weekRecipe = await db.query.weekRecipesTable.findFirst({
      where: eq(weekRecipesTable.id, input.weekRecipeId),
      with: { week: true },
    });

    if (!weekRecipe) {
      throw new ZSAError("NOT_FOUND", "Week recipe not found");
    }

    await requirePermission(user.id, weekRecipe.week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

    await db.delete(weekRecipesTable)
      .where(eq(weekRecipesTable.id, input.weekRecipeId));

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${weekRecipe.weekId}`);

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

    // Update order for each week recipe
    for (let i = 0; i < input.weekRecipeIds.length; i++) {
      await db.update(weekRecipesTable)
        .set({ order: i })
        .where(eq(weekRecipesTable.id, input.weekRecipeIds[i]));
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

    // Get week recipe to verify permission
    const existing = await db.query.weekRecipesTable.findFirst({
      where: eq(weekRecipesTable.id, input.weekRecipeId),
      with: { week: true },
    });

    if (!existing) {
      throw new ZSAError("NOT_FOUND", "Week recipe not found");
    }

    await requirePermission(user.id, existing.week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

    const [weekRecipe] = await db.update(weekRecipesTable)
      .set({ made: input.made })
      .where(eq(weekRecipesTable.id, input.weekRecipeId))
      .returning();

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${existing.weekId}`);

    return { weekRecipe };
  });

export const updateWeekRecipeScheduledDateAction = createServerAction()
  .input(updateWeekRecipeScheduledDateSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Get week recipe to verify permission
    const existing = await db.query.weekRecipesTable.findFirst({
      where: eq(weekRecipesTable.id, input.weekRecipeId),
      with: { week: true },
    });

    if (!existing) {
      throw new ZSAError("NOT_FOUND", "Week recipe not found");
    }

    await requirePermission(user.id, existing.week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

    const [weekRecipe] = await db.update(weekRecipesTable)
      .set({ scheduledDate: input.scheduledDate })
      .where(eq(weekRecipesTable.id, input.weekRecipeId))
      .returning();

    revalidatePath("/schedule");
    revalidatePath(`/schedule/${existing.weekId}`);

    return { weekRecipe };
  });
