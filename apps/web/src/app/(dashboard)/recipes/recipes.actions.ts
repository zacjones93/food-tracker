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
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { getRecipeVisibilityConditions } from "@/utils/recipe-visibility";
import { teamSettingsTable } from "@/db/schema";
import { publishDialRecipeChange } from "@/lib/dial-integration";
import { getRecipeScheduleStats, recipeListColumns, type RecipeScheduleStats } from "@/lib/recipe-list-queries";
import { canViewRecipeByLink } from "@/lib/recipe-access";

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

    if (input.sourceRecipeId) {
      const sourceRecipe = await db.query.recipesTable.findFirst({
        where: and(
          eq(recipesTable.id, input.sourceRecipeId),
          or(
            eq(recipesTable.teamId, session.activeTeamId),
            inArray(recipesTable.visibility, [
              RECIPE_VISIBILITY.PUBLIC,
              RECIPE_VISIBILITY.UNLISTED,
            ]),
          ),
        ),
      });
      if (!sourceRecipe) {
        throw new ZSAError("NOT_FOUND", "Source recipe not found");
      }
    }

    // Fetch team settings to get default visibility
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const defaultVisibility = (teamSettings?.defaultRecipeVisibility || 'public') as 'public' | 'private' | 'unlisted';

    // Helper to convert empty strings to undefined
    const cleanString = (val: string | undefined) => val === "" ? undefined : val;

    const [recipe] = await db.insert(recipesTable)
      .values({
        teamId: session.activeTeamId,
        name: input.name,
        sourceRecipeId: input.sourceRecipeId,
        emoji: cleanString(input.emoji),
        tags: input.tags,
        mealType: cleanString(input.mealType),
        difficulty: cleanString(input.difficulty),
        // Use input visibility if provided, otherwise use team default
        visibility: input.visibility ?? defaultVisibility,
        recipeType: input.recipeType,
        ingredients: input.ingredients,
        recipeBody: input.recipeBody,
        recipeLink: cleanString(input.recipeLink),
        recipeBookId: cleanString(input.recipeBookId),
        page: cleanString(input.page),
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
            scheduleLeadDays: relatedRecipe.scheduleLeadDays,
          });
        } catch {
          // Continue with other relations even if one fails
        }
      }
    }

    await publishDialRecipeChange({ current: recipe, previous: null });

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

    // Fetch recipe to get teamId
    const existingRecipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, id),
    });

    if (!existingRecipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    await requirePermission(user.id, existingRecipe.teamId, TEAM_PERMISSIONS.EDIT_RECIPES);

    // Process update data: convert empty strings to null, filter out undefined
    const processedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        // Convert empty strings to null (to clear fields)
        if (typeof value === "string" && value === "") {
          processedData[key] = null;
        } else {
          processedData[key] = value;
        }
      }
    }

    const [recipe] = await db.update(recipesTable)
      .set(processedData)
      .where(eq(recipesTable.id, id))
      .returning();

    // Handle related recipes if provided
    if (relatedRecipes !== undefined) {
      // Delete all existing relations where this recipe is the main recipe
      await db.delete(recipeRelationsTable)
        .where(eq(recipeRelationsTable.mainRecipeId, id));

      // Insert new relations
      if (relatedRecipes && relatedRecipes.length > 0) {
        for (let i = 0; i < relatedRecipes.length; i++) {
          const relatedRecipe = relatedRecipes[i];
          try {
            await db.insert(recipeRelationsTable).values({
              mainRecipeId: id,
              sideRecipeId: relatedRecipe.recipeId,
              relationType: relatedRecipe.relationType,
              order: i,
              scheduleLeadDays: relatedRecipe.scheduleLeadDays,
            });
          } catch {
            // Continue with other relations even if one fails
          }
        }
      }
    }

    await publishDialRecipeChange({ current: recipe, previous: existingRecipe });

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

    await publishDialRecipeChange({
      current: null,
      previous: existingRecipe,
      reason: "recipe_deleted",
    });

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
      // Create fuzzy search: case-insensitive, searches name and tags
      // Split search into words for multi-word matching
      const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);

      if (searchTerms.length > 0) {
        // For each search term, match if it appears in name OR tags
        const searchConditions = searchTerms.map(term =>
          or(
            // Case-insensitive search in name using LOWER()
            sql`LOWER(${recipesTable.name}) LIKE ${`%${term}%`}`,
            // Search in tags JSON array (convert to lowercase for comparison)
            sql`LOWER(json_extract(${recipesTable.tags}, '$')) LIKE ${`%${term}%`}`
          )
        );

        // All search terms must match (AND logic across terms)
        const validSearchConditions = searchConditions.filter((c): c is NonNullable<typeof c> => c !== undefined);
        if (validSearchConditions.length > 0) {
          const searchCondition = and(...validSearchConditions);
          if (searchCondition) {
            conditions.push(searchCondition);
          }
        }
      }
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

    // Match tags exactly, with OR within each filter and AND between filters.
    for (const values of [tags, seasons]) {
      if (values?.length) conditions.push(sql`exists (
        select 1 from json_each(${recipesTable.tags})
        where value in (select value from json_each(${JSON.stringify(values)}))
      )`);
    }

    // Matching and ordering need only list metadata, never recipe content.
    let allRecipes = (await db.select({ id: recipesTable.id, name: recipesTable.name, createdAt: recipesTable.createdAt }).from(recipesTable)
      .where(and(...conditions)).orderBy(recipesTable.id))
      .map(recipe => ({ recipe, weekCount: 0, latestWeekId: null as string | null, latestWeekName: null as string | null }));

    // Count-dependent filters/sorts must see all candidates before pagination.
    const needsCounts = sortBy === "mostEaten" || minMealsEaten !== undefined || maxMealsEaten !== undefined;
    const stats = needsCounts
      ? await getRecipeScheduleStats({ db, teamId: session.activeTeamId, recipeIds: allRecipes.map(item => item.recipe.id) })
      : new Map<string, RecipeScheduleStats>();
    if (needsCounts) allRecipes = allRecipes.map(item => ({ ...item, ...stats.get(item.recipe.id) }));
    if (minMealsEaten !== undefined) allRecipes = allRecipes.filter(item => item.weekCount >= minMealsEaten);
    if (maxMealsEaten !== undefined) allRecipes = allRecipes.filter(item => item.weekCount <= maxMealsEaten);

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
    const pageIds = paginatedResults.map(item => item.recipe.id);
    const [pageRows, pageStats] = pageIds.length ? await Promise.all([
      db.select(recipeListColumns).from(recipesTable)
        .where(inArray(recipesTable.id, sql`(select value from json_each(${JSON.stringify(pageIds)}))`)),
      needsCounts ? Promise.resolve(stats) : getRecipeScheduleStats({ db, teamId: session.activeTeamId, recipeIds: pageIds }),
    ]) : [[], new Map()];
    const details = new Map(pageRows.map(recipe => [recipe.id, recipe]));
    const recipes = paginatedResults.map(item => ({
      ...details.get(item.recipe.id)!,
      mealsEatenCount: pageStats.get(item.recipe.id)?.weekCount ?? 0,
      latestWeekId: pageStats.get(item.recipe.id)?.latestWeekId ?? null,
      latestWeekName: pageStats.get(item.recipe.id)?.latestWeekName ?? null,
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
    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_RECIPES,
    );

    const db = getDB();

    const recipe = await db.query.recipesTable.findFirst({
      where: and(
        eq(recipesTable.id, input.id),
        eq(recipesTable.teamId, session.activeTeamId),
      ),
    });

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    const [updatedRecipe] = await db.update(recipesTable)
      .set({
        mealsEatenCount: (recipe.mealsEatenCount || 0) + 1,
        lastMadeDate: new Date(),
      })
      .where(and(
        eq(recipesTable.id, input.id),
        eq(recipesTable.teamId, session.activeTeamId),
      ))
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

    const metadataQuery = db.all<{ kind: string; value: string }>(sql`
      with visible as materialized (select mealType, difficulty, tags from ${recipesTable} where ${visibilityConditions})
      select 'mealType' as kind, mealType as value from visible where mealType != ''
      union select 'difficulty', difficulty from visible where difficulty != ''
      union select 'tag', value from visible, json_each(visible.tags) where value != ''
    `);
    const [metadata, recipeBooks] = await Promise.all([
      metadataQuery,
      db.select().from(recipeBooksTable),
    ]);
    const mealTypes = metadata.filter(row => row.kind === 'mealType').map(row => row.value).sort();
    const difficulties = metadata.filter(row => row.kind === 'difficulty').map(row => row.value).sort();
    const tags = metadata.filter(row => row.kind === 'tag').map(row => row.value).sort();

    return {
      mealTypes: mealTypes || [],
      difficulties: difficulties || [],
      tags: tags || [],
      recipeBooks: recipeBooks || [],
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
      relationsAsMain: relationsAsMain.filter(({ sideRecipe }) =>
        canViewRecipeByLink({ recipe: sideRecipe, activeTeamId: session?.activeTeamId })
      ),
      relationsAsSide: relationsAsSide.filter(({ mainRecipe }) =>
        canViewRecipeByLink({ recipe: mainRecipe, activeTeamId: session?.activeTeamId })
      ),
    };
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
