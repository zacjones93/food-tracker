"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { recipesTable, weekRecipesTable, weeksTable, recipeBooksTable, TEAM_PERMISSIONS, RECIPE_VISIBILITY, recipeRelationsTable } from "@/db/schema";
import {
  createRecipeSchema,
  updateRecipeSchema,
  deleteRecipeSchema,
  getRecipeByIdSchema,
  incrementMealsEatenSchema,
  getRecipesSchema,
} from "@/schemas/recipe.schema";
import { eq, and, like, sql, or, inArray } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { getRecipeVisibilityConditions } from "@/utils/recipe-visibility";
import { teamSettingsTable } from "@/db/schema";

export const createRecipeAction = createServerAction()
  .input(createRecipeSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.CREATE_RECIPES);

    const db = getDB();

    // Fetch team settings to get default visibility
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const defaultVisibility = (teamSettings?.defaultRecipeVisibility || 'public') as 'public' | 'private' | 'unlisted';

    const [recipe] = await db.insert(recipesTable)
      .values({
        teamId: session.activeTeamId,
        name: input.name,
        emoji: input.emoji,
        tags: input.tags,
        mealType: input.mealType,
        difficulty: input.difficulty,
        // Use input visibility if provided, otherwise use team default
        visibility: input.visibility ?? defaultVisibility,
        ingredients: input.ingredients,
        recipeBody: input.recipeBody,
        recipeLink: input.recipeLink,
        recipeBookId: input.recipeBookId,
        page: input.page,
      })
      .returning();

    // Handle related recipes if provided
    if (input.relatedRecipes && input.relatedRecipes.length > 0) {
      // D1 doesn't support transactions, so we insert relations sequentially
      for (let i = 0; i < input.relatedRecipes.length; i++) {
        const relatedRecipe = input.relatedRecipes[i];
        try {
          await db.insert(recipeRelationsTable).values({
            mainRecipeId: recipe.id,
            sideRecipeId: relatedRecipe.recipeId,
            relationType: relatedRecipe.relationType,
            order: i,
          });
        } catch (error) {
          console.error('[CREATE RECIPE] Failed to insert relation:', error);
          // Continue with other relations even if one fails
        }
      }
    }

    return { recipe };
  });

export const updateRecipeAction = createServerAction()
  .input(updateRecipeSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();
    const { id, relatedRecipes, ...updateData } = input;

    console.log('[UPDATE RECIPE] Input:', JSON.stringify(input, null, 2));
    console.log('[UPDATE RECIPE] UpdateData:', JSON.stringify(updateData, null, 2));

    // Fetch recipe to get teamId
    const existingRecipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, id),
    });

    if (!existingRecipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    await requirePermission(user.id, existingRecipe.teamId, TEAM_PERMISSIONS.EDIT_RECIPES);

    const [recipe] = await db.update(recipesTable)
      .set(updateData)
      .where(eq(recipesTable.id, id))
      .returning();

    // Handle related recipes if provided
    if (relatedRecipes !== undefined) {
      // Delete all existing relations where this recipe is the main recipe
      await db.delete(recipeRelationsTable)
        .where(eq(recipeRelationsTable.mainRecipeId, id));

      // Insert new relations
      if (relatedRecipes.length > 0) {
        for (let i = 0; i < relatedRecipes.length; i++) {
          const relatedRecipe = relatedRecipes[i];
          try {
            await db.insert(recipeRelationsTable).values({
              mainRecipeId: id,
              sideRecipeId: relatedRecipe.recipeId,
              relationType: relatedRecipe.relationType,
              order: i,
            });
          } catch (error) {
            console.error('[UPDATE RECIPE] Failed to insert relation:', error);
            // Continue with other relations even if one fails
          }
        }
      }
    }

    return { recipe };
  });

export const deleteRecipeAction = createServerAction()
  .input(deleteRecipeSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Fetch recipe to get teamId
    const existingRecipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, input.id),
    });

    if (!existingRecipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    await requirePermission(user.id, existingRecipe.teamId, TEAM_PERMISSIONS.DELETE_RECIPES);

    await db.delete(recipesTable)
      .where(eq(recipesTable.id, input.id));

    return { success: true };
  });

export const getRecipeByIdAction = createServerAction()
  .input(getRecipeByIdSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();

    // Fetch team settings to determine visibility mode
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const visibilityMode = (teamSettings?.recipeVisibilityMode || 'all') as 'all' | 'team_only';
    const visibilityConditions = getRecipeVisibilityConditions(
      session.activeTeamId,
      visibilityMode
    );

    const [result] = await db
      .select({
        recipe: recipesTable,
        weekCount: sql<number>`count(distinct case when ${weeksTable.teamId} = ${session.activeTeamId} then ${weekRecipesTable.weekId} end)`.as('weekCount'),
      })
      .from(recipesTable)
      .leftJoin(weekRecipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
      .leftJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
      .where(and(
        eq(recipesTable.id, input.id),
        visibilityConditions
      ))
      .groupBy(recipesTable.id);

    if (!result) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    // Fetch recipe book separately if exists
    let recipeBook = null;
    if (result.recipe.recipeBookId) {
      recipeBook = await db.query.recipeBooksTable.findFirst({
        where: eq(recipeBooksTable.id, result.recipe.recipeBookId),
      });
    }

    // Fetch related recipes (as main)
    const relationsAsMain = await db.query.recipeRelationsTable.findMany({
      where: eq(recipeRelationsTable.mainRecipeId, input.id),
      with: {
        sideRecipe: true,
      },
      orderBy: (relations, { asc }) => [asc(relations.order)],
    });

    // Fetch related recipes (as side)
    const relationsAsSide = await db.query.recipeRelationsTable.findMany({
      where: eq(recipeRelationsTable.sideRecipeId, input.id),
      with: {
        mainRecipe: true,
      },
    });

    const recipe = {
      ...result.recipe,
      mealsEatenCount: result.weekCount || 0,
      recipeBook,
    };

    return {
      recipe,
      relationsAsMain,
      relationsAsSide,
    };
  });

export const getRecipesAction = createServerAction()
  .input(getRecipesSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();
    const { search, page, limit, mealType, difficulty, visibility, tags, seasons, minMealsEaten, maxMealsEaten, recipeBookId, sortBy } = input;

    // Fetch team settings to determine visibility mode
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const visibilityMode = (teamSettings?.recipeVisibilityMode || 'all') as 'all' | 'team_only';
    const visibilityConditions = getRecipeVisibilityConditions(
      session.activeTeamId,
      visibilityMode
    );

    const conditions = [visibilityConditions];

    if (search) {
      conditions.push(like(recipesTable.name, `%${search}%`));
    }

    if (mealType) {
      conditions.push(eq(recipesTable.mealType, mealType));
    }

    if (difficulty) {
      conditions.push(eq(recipesTable.difficulty, difficulty));
    }

    if (visibility) {
      conditions.push(eq(recipesTable.visibility, visibility));
    }

    if (recipeBookId) {
      conditions.push(eq(recipesTable.recipeBookId, recipeBookId));
    }

    const whereClause = and(...conditions);

    // Fetch all matching recipes (before pagination) with week count and latest week
    let allRecipes = await db
      .select({
        recipe: recipesTable,
        weekCount: sql<number>`count(distinct case when ${weeksTable.teamId} = ${session.activeTeamId} then ${weekRecipesTable.weekId} end)`.as('weekCount'),
        latestWeekId: sql<string | null>`(
          select ${weeksTable.id}
          from ${weekRecipesTable}
          inner join ${weeksTable} on ${weeksTable.id} = ${weekRecipesTable.weekId}
          where ${weekRecipesTable.recipeId} = ${recipesTable.id}
            and ${weeksTable.teamId} = ${session.activeTeamId}
          order by ${weeksTable.startDate} desc
          limit 1
        )`.as('latestWeekId'),
        latestWeekName: sql<string | null>`(
          select ${weeksTable.name}
          from ${weekRecipesTable}
          inner join ${weeksTable} on ${weeksTable.id} = ${weekRecipesTable.weekId}
          where ${weekRecipesTable.recipeId} = ${recipesTable.id}
            and ${weeksTable.teamId} = ${session.activeTeamId}
          order by ${weeksTable.startDate} desc
          limit 1
        )`.as('latestWeekName'),
      })
      .from(recipesTable)
      .leftJoin(weekRecipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
      .leftJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
      .where(whereClause)
      .groupBy(recipesTable.id);

    // Filter by tags in memory (since JSON filtering is complex in SQLite/D1)
    // Must be done BEFORE pagination to get correct counts
    if (tags && tags.length > 0) {
      allRecipes = allRecipes.filter(item =>
        item.recipe.tags && tags.some(tag => item.recipe.tags?.includes(tag))
      );
    }

    // Filter by seasons in memory (seasonal tags are part of the tags array)
    if (seasons && seasons.length > 0) {
      allRecipes = allRecipes.filter(item =>
        item.recipe.tags && seasons.some(season => item.recipe.tags?.includes(season))
      );
    }

    // Filter by mealsEaten count in memory (now calculated from weeks)
    if (minMealsEaten !== undefined) {
      allRecipes = allRecipes.filter(item => (item.weekCount || 0) >= minMealsEaten);
    }

    if (maxMealsEaten !== undefined) {
      allRecipes = allRecipes.filter(item => (item.weekCount || 0) <= maxMealsEaten);
    }

    // Sort based on sortBy parameter
    allRecipes.sort((a, b) => {
      if (sortBy === "mostEaten") {
        const countDiff = (b.weekCount || 0) - (a.weekCount || 0);
        if (countDiff !== 0) return countDiff;
        return (a.recipe.name || "").localeCompare(b.recipe.name || "");
      } else if (sortBy === "name") {
        return (a.recipe.name || "").localeCompare(b.recipe.name || "");
      } else {
        // Default: newest first
        const dateA = a.recipe.createdAt ? new Date(a.recipe.createdAt).getTime() : 0;
        const dateB = b.recipe.createdAt ? new Date(b.recipe.createdAt).getTime() : 0;
        const dateDiff = dateB - dateA;
        if (dateDiff !== 0) return dateDiff;
        return (a.recipe.name || "").localeCompare(b.recipe.name || "");
      }
    });

    // Get total count after filtering
    const total = allRecipes.length;

    // Apply pagination to filtered and sorted results
    const paginatedResults = allRecipes.slice((page - 1) * limit, page * limit);

    // Transform results to include week info with recipe
    const recipes = paginatedResults.map(item => ({
      ...item.recipe,
      mealsEatenCount: item.weekCount || 0,
      latestWeekId: item.latestWeekId,
      latestWeekName: item.latestWeekName,
    }));

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
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
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

export const getRecipeMetadataAction = createServerAction()
  .handler(async () => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();

    // Fetch team settings to determine visibility mode
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const visibilityMode = (teamSettings?.recipeVisibilityMode || 'all') as 'all' | 'team_only';
    const visibilityConditions = getRecipeVisibilityConditions(
      session.activeTeamId,
      visibilityMode
    );

    const recipes = await db.select({
      mealType: recipesTable.mealType,
      difficulty: recipesTable.difficulty,
      tags: recipesTable.tags,
    })
      .from(recipesTable)
      .where(visibilityConditions);

    // Extract unique meal types
    const mealTypes = [...new Set(
      recipes
        .map(r => r.mealType)
        .filter((t): t is string => !!t)
    )].sort();

    // Extract unique difficulties
    const difficulties = [...new Set(
      recipes
        .map(r => r.difficulty)
        .filter((d): d is string => !!d)
    )].sort();

    // Extract unique tags
    const allTags = recipes
      .flatMap(r => r.tags || [])
      .filter((t): t is string => !!t);
    const tags = [...new Set(allTags)].sort();

    // Get all recipe books
    const recipeBooks = await db.select().from(recipeBooksTable);

    return {
      mealTypes,
      difficulties,
      tags,
      recipeBooks,
    };
  });

export const getPublicRecipeByIdAction = createServerAction()
  .input(getRecipeByIdSchema)
  .handler(async ({ input }) => {
    const db = getDB();
    const session = await getSessionFromCookie();

    // Build visibility conditions based on authentication
    let visibilityCondition;
    if (session?.activeTeamId) {
      // Authenticated: show own team's recipes (all) + other teams' public/unlisted
      visibilityCondition = or(
        eq(recipesTable.teamId, session.activeTeamId),
        inArray(recipesTable.visibility, [RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.UNLISTED])
      );
    } else {
      // Unauthenticated: only show public/unlisted recipes
      visibilityCondition = inArray(recipesTable.visibility, [RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.UNLISTED]);
    }

    const [result] = await db
      .select({
        recipe: recipesTable,
        weekCount: session?.activeTeamId
          ? sql<number>`count(distinct case when ${weeksTable.teamId} = ${session.activeTeamId} then ${weekRecipesTable.weekId} end)`.as('weekCount')
          : sql<number>`0`.as('weekCount'),
      })
      .from(recipesTable)
      .leftJoin(weekRecipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
      .leftJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
      .where(and(
        eq(recipesTable.id, input.id),
        visibilityCondition
      ))
      .groupBy(recipesTable.id);

    if (!result) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    // Fetch recipe book separately if exists
    let recipeBook = null;
    if (result.recipe.recipeBookId) {
      recipeBook = await db.query.recipeBooksTable.findFirst({
        where: eq(recipeBooksTable.id, result.recipe.recipeBookId),
      });
    }

    const recipe = {
      ...result.recipe,
      mealsEatenCount: result.weekCount || 0,
      recipeBook,
    };

    return { recipe };
  });

export const createRecipeBookAction = createServerAction()
  .input(z.object({ name: z.string().min(1).max(500) }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const [recipeBook] = await db.insert(recipeBooksTable)
      .values({ name: input.name })
      .returning();

    return { recipeBook };
  });
