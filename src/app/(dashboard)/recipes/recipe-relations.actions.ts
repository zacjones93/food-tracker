"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { recipeRelationsTable, recipesTable, TEAM_PERMISSIONS } from "@/db/schema";
import {
  createRecipeRelationSchema,
  deleteRecipeRelationSchema,
  getRecipeRelationsSchema,
  reorderRecipeRelationsSchema,
} from "@/schemas/recipe-relation.schema";
import { eq, and, or } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { hasAccessToRecipe } from "@/utils/recipe-visibility";

/**
 * Add a relation between two recipes
 */
export const addRecipeRelationAction = createServerAction()
  .input(createRecipeRelationSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.EDIT_RECIPES);

    const db = getDB();

    // Validate both recipes exist and user has access to them
    const [mainRecipe, sideRecipe] = await Promise.all([
      db.query.recipesTable.findFirst({
        where: eq(recipesTable.id, input.mainRecipeId),
      }),
      db.query.recipesTable.findFirst({
        where: eq(recipesTable.id, input.sideRecipeId),
      }),
    ]);

    if (!mainRecipe) {
      throw new ZSAError("NOT_FOUND", "Main recipe not found");
    }

    if (!sideRecipe) {
      throw new ZSAError("NOT_FOUND", "Side recipe not found");
    }

    // Check visibility access for both recipes
    const [hasMainAccess, hasSideAccess] = await Promise.all([
      hasAccessToRecipe(mainRecipe, user.id, session.activeTeamId),
      hasAccessToRecipe(sideRecipe, user.id, session.activeTeamId),
    ]);

    if (!hasMainAccess) {
      throw new ZSAError("FORBIDDEN", "You don't have access to the main recipe");
    }

    if (!hasSideAccess) {
      throw new ZSAError("FORBIDDEN", "You don't have access to the side recipe");
    }

    // Check if relation already exists
    const existingRelation = await db.query.recipeRelationsTable.findFirst({
      where: and(
        eq(recipeRelationsTable.mainRecipeId, input.mainRecipeId),
        eq(recipeRelationsTable.sideRecipeId, input.sideRecipeId)
      ),
    });

    if (existingRelation) {
      throw new ZSAError("CONFLICT", "This relation already exists");
    }

    // Insert the relation
    const [relation] = await db.insert(recipeRelationsTable)
      .values({
        mainRecipeId: input.mainRecipeId,
        sideRecipeId: input.sideRecipeId,
        relationType: input.relationType,
        order: input.order ?? 0,
      })
      .returning();

    return { relation };
  });

/**
 * Remove a relation between two recipes
 */
export const removeRecipeRelationAction = createServerAction()
  .input(deleteRecipeRelationSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.EDIT_RECIPES);

    const db = getDB();

    // Validate both recipes exist and user has access
    const [mainRecipe, sideRecipe] = await Promise.all([
      db.query.recipesTable.findFirst({
        where: eq(recipesTable.id, input.mainRecipeId),
      }),
      db.query.recipesTable.findFirst({
        where: eq(recipesTable.id, input.sideRecipeId),
      }),
    ]);

    if (!mainRecipe) {
      throw new ZSAError("NOT_FOUND", "Main recipe not found");
    }

    if (!sideRecipe) {
      throw new ZSAError("NOT_FOUND", "Side recipe not found");
    }

    // Delete the relation
    await db.delete(recipeRelationsTable)
      .where(and(
        eq(recipeRelationsTable.mainRecipeId, input.mainRecipeId),
        eq(recipeRelationsTable.sideRecipeId, input.sideRecipeId)
      ));

    return { success: true };
  });

/**
 * Get all relations for a recipe (both as main and as side)
 */
export const getRecipeRelationsAction = createServerAction()
  .input(getRecipeRelationsSchema)
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

    // Validate recipe exists and user has access
    const recipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, input.recipeId),
    });

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    const hasAccess = await hasAccessToRecipe(recipe, user.id, session.activeTeamId);
    if (!hasAccess) {
      throw new ZSAError("FORBIDDEN", "You don't have access to this recipe");
    }

    // Get relations where this recipe is the main recipe
    const relationsAsMain = await db.query.recipeRelationsTable.findMany({
      where: eq(recipeRelationsTable.mainRecipeId, input.recipeId),
      with: {
        sideRecipe: true,
      },
    });

    // Get relations where this recipe is the side recipe
    const relationsAsSide = await db.query.recipeRelationsTable.findMany({
      where: eq(recipeRelationsTable.sideRecipeId, input.recipeId),
      with: {
        mainRecipe: true,
      },
    });

    return {
      relationsAsMain,
      relationsAsSide,
    };
  });

/**
 * Reorder relations for a recipe
 */
export const reorderRecipeRelationsAction = createServerAction()
  .input(reorderRecipeRelationsSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    await requirePermission(user.id, session.activeTeamId, TEAM_PERMISSIONS.EDIT_RECIPES);

    const db = getDB();

    // Validate recipe exists and user has access
    const recipe = await db.query.recipesTable.findFirst({
      where: eq(recipesTable.id, input.mainRecipeId),
    });

    if (!recipe) {
      throw new ZSAError("NOT_FOUND", "Recipe not found");
    }

    const hasAccess = await hasAccessToRecipe(recipe, user.id, session.activeTeamId);
    if (!hasAccess) {
      throw new ZSAError("FORBIDDEN", "You don't have access to this recipe");
    }

    // Update order for each relation
    // D1 doesn't support transactions, so we do this sequentially
    for (let i = 0; i < input.relationIds.length; i++) {
      const relationId = input.relationIds[i];
      await db.update(recipeRelationsTable)
        .set({ order: i })
        .where(and(
          eq(recipeRelationsTable.id, relationId),
          eq(recipeRelationsTable.mainRecipeId, input.mainRecipeId)
        ));
    }

    return { success: true };
  });
