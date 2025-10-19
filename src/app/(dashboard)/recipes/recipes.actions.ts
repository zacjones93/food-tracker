"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { recipesTable, weekRecipesTable, weeksTable, recipeBooksTable, TEAM_PERMISSIONS, RECIPE_VISIBILITY } from "@/db/schema";
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

    const [recipe] = await db.insert(recipesTable)
      .values({
        teamId: session.activeTeamId,
        name: input.name,
        emoji: input.emoji,
        tags: input.tags,
        mealType: input.mealType,
        difficulty: input.difficulty,
        visibility: input.visibility,
        ingredients: input.ingredients,
        recipeBody: input.recipeBody,
        recipeLink: input.recipeLink,
        recipeBookId: input.recipeBookId,
        page: input.page,
      })
      .returning();

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
    const { id, ...updateData } = input;

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

    // Allow viewing:
    // - Own team's recipes (all visibilities)
    // - Other teams' public/unlisted recipes (not private)
    const [result] = await db
      .select({
        recipe: recipesTable,
        weekCount: sql<number>`count(distinct ${weekRecipesTable.weekId})`.as('weekCount'),
      })
      .from(recipesTable)
      .leftJoin(weekRecipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
      .where(and(
        eq(recipesTable.id, input.id),
        or(
          eq(recipesTable.teamId, session.activeTeamId),
          inArray(recipesTable.visibility, [RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.UNLISTED])
        )
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
    const { search, page, limit, mealType, difficulty, visibility, tags, seasons, minMealsEaten, maxMealsEaten, recipeBookId } = input;

    // Build WHERE conditions for visibility filtering:
    // - Show own team's recipes (all visibilities)
    // - Show other teams' public recipes only (not private, not unlisted)
    const visibilityConditions = or(
      eq(recipesTable.teamId, session.activeTeamId),
      eq(recipesTable.visibility, RECIPE_VISIBILITY.PUBLIC)
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
        weekCount: sql<number>`count(distinct ${weekRecipesTable.weekId})`.as('weekCount'),
        latestWeekId: sql<string | null>`(
          select ${weeksTable.id}
          from ${weekRecipesTable}
          inner join ${weeksTable} on ${weeksTable.id} = ${weekRecipesTable.weekId}
          where ${weekRecipesTable.recipeId} = ${recipesTable.id}
          order by ${weeksTable.startDate} desc
          limit 1
        )`.as('latestWeekId'),
        latestWeekName: sql<string | null>`(
          select ${weeksTable.name}
          from ${weekRecipesTable}
          inner join ${weeksTable} on ${weeksTable.id} = ${weekRecipesTable.weekId}
          where ${weekRecipesTable.recipeId} = ${recipesTable.id}
          order by ${weeksTable.startDate} desc
          limit 1
        )`.as('latestWeekName'),
      })
      .from(recipesTable)
      .leftJoin(weekRecipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
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

    // Sort by meals eaten (descending), then by name
    allRecipes.sort((a, b) => {
      const countDiff = (b.weekCount || 0) - (a.weekCount || 0);
      if (countDiff !== 0) return countDiff;
      return (a.recipe.name || "").localeCompare(b.recipe.name || "");
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
    const { user } = session;

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

    // Get all recipes visible to user to extract unique values
    // - Own team's recipes (all visibilities)
    // - Other teams' public recipes only
    const recipes = await db.select({
      mealType: recipesTable.mealType,
      difficulty: recipesTable.difficulty,
      tags: recipesTable.tags,
    })
    .from(recipesTable)
    .where(or(
      eq(recipesTable.teamId, session.activeTeamId),
      eq(recipesTable.visibility, RECIPE_VISIBILITY.PUBLIC)
    ));

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

export const createRecipeBookAction = createServerAction()
  .input(z.object({ name: z.string().min(1).max(500) }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    const [recipeBook] = await db.insert(recipeBooksTable)
      .values({ name: input.name })
      .returning();

    return { recipeBook };
  });
