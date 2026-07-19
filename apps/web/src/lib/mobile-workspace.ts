import "server-only";

import { getDB } from "@/db";
import {
  groceryItemsTable,
  groceryListTemplatesTable,
  recipeBooksTable,
  recipeRelationsTable,
  recipesTable,
  syncChangesTable,
  syncEntitiesTable,
  TEAM_PERMISSIONS,
  weekRecipesTable,
  weeksTable,
} from "@/db/schema";
import { normalizeIngredients } from "@/utils/ingredient-helpers";
import { and, asc, eq, exists, isNull, max, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

const sideRecipesTable = alias(recipesTable, "sideRecipes");

function normalizeMobileDate(value: Date | null | undefined) {
  if (!value) return value;
  const milliseconds = value.getTime();
  return Math.abs(milliseconds) > 100_000_000_000_000
    ? new Date(milliseconds / 1_000)
    : value;
}

export async function getMobileWorkspace({
  permissions,
  teamId,
}: {
  permissions: string[];
  teamId: string;
}) {
  const db = getDB();
  const canAccessRecipes = permissions.includes(TEAM_PERMISSIONS.ACCESS_RECIPES);
  const canAccessSchedules = permissions.includes(TEAM_PERMISSIONS.ACCESS_SCHEDULES);
  const canAccessTemplates = permissions.includes(TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES);
  const visibleEntityTypes = new Set<string>();
  if (canAccessRecipes) {
    visibleEntityTypes.add("recipe");
    visibleEntityTypes.add("recipeBook");
    visibleEntityTypes.add("recipeRelation");
  }
  if (canAccessSchedules) {
    visibleEntityTypes.add("week");
    visibleEntityTypes.add("weekRecipe");
    visibleEntityTypes.add("groceryItem");
  }
  if (canAccessTemplates) visibleEntityTypes.add("groceryTemplate");
  // Capture the high-water mark before reading the snapshot. Concurrent changes
  // after this point remain visible to the next incremental pull.
  const cursorRows = await db
    .select({ cursor: max(syncChangesTable.sequence) })
    .from(syncChangesTable)
    .where(eq(syncChangesTable.teamId, teamId));

  const [recipes, weeks, groceryTemplates, versions] = await Promise.all([
    canAccessRecipes ? db.query.recipesTable.findMany({
      where: eq(recipesTable.teamId, teamId),
      orderBy: (table, { asc: orderAscending }) => [orderAscending(table.name)],
    }) : Promise.resolve([]),
    canAccessSchedules ? db.query.weeksTable.findMany({
      where: eq(weeksTable.teamId, teamId),
      orderBy: (table, { desc }) => [desc(table.startDate), desc(table.createdAt)],
    }) : Promise.resolve([]),
    canAccessTemplates ? db.query.groceryListTemplatesTable.findMany({
      where: or(
        eq(groceryListTemplatesTable.teamId, teamId),
        isNull(groceryListTemplatesTable.teamId),
      ),
      orderBy: (table, { asc: orderAscending }) => [orderAscending(table.name)],
    }) : Promise.resolve([]),
    db.query.syncEntitiesTable.findMany({
      where: eq(syncEntitiesTable.teamId, teamId),
    }),
  ]);

  const [weekRecipes, groceryItems, recipeRelations, recipeBooks] = await Promise.all([
    !canAccessSchedules
      ? Promise.resolve([])
      : db
          .select({ weekRecipe: weekRecipesTable })
          .from(weekRecipesTable)
          .innerJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
          .where(eq(weeksTable.teamId, teamId))
          .orderBy(asc(weekRecipesTable.scheduledDate), asc(weekRecipesTable.order))
          .then((rows) => rows.map(({ weekRecipe }) => weekRecipe)),
    !canAccessSchedules
      ? Promise.resolve([])
      : db
          .select({ groceryItem: groceryItemsTable })
          .from(groceryItemsTable)
          .innerJoin(weeksTable, eq(groceryItemsTable.weekId, weeksTable.id))
          .where(eq(weeksTable.teamId, teamId))
          .orderBy(asc(groceryItemsTable.category), asc(groceryItemsTable.order))
          .then((rows) => rows.map(({ groceryItem }) => groceryItem)),
    !canAccessRecipes
      ? Promise.resolve([])
      : db
          .select({ relation: recipeRelationsTable })
          .from(recipeRelationsTable)
          .innerJoin(recipesTable, eq(recipeRelationsTable.mainRecipeId, recipesTable.id))
          .innerJoin(sideRecipesTable, eq(recipeRelationsTable.sideRecipeId, sideRecipesTable.id))
          .where(
            and(
              eq(recipesTable.teamId, teamId),
              eq(sideRecipesTable.teamId, teamId),
            ),
          )
          .orderBy(asc(recipeRelationsTable.order))
          .then((rows) => rows.map(({ relation }) => relation)),
    !canAccessRecipes
      ? Promise.resolve([])
      : db
          .select({ recipeBook: recipeBooksTable })
          .from(recipeBooksTable)
          .where(
            or(
              eq(recipeBooksTable.teamId, teamId),
              isNull(recipeBooksTable.teamId),
              exists(
                db
                  .select({ id: recipesTable.id })
                  .from(recipesTable)
                  .where(
                    and(
                      eq(recipesTable.teamId, teamId),
                      eq(recipesTable.recipeBookId, recipeBooksTable.id),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(asc(recipeBooksTable.name))
          .then((rows) => rows.map(({ recipeBook }) => recipeBook)),
  ]);

  return {
    protocolVersion: 1,
    cursor: String(cursorRows[0]?.cursor ?? 0),
    recipes: recipes.map((recipe) => ({
      ...recipe,
      ingredients: normalizeIngredients(recipe.ingredients),
      createdAt: normalizeMobileDate(recipe.createdAt),
      updatedAt: normalizeMobileDate(recipe.updatedAt),
      lastMadeDate: normalizeMobileDate(recipe.lastMadeDate),
    })),
    weeks: weeks.map((week) => ({
      ...week,
      createdAt: normalizeMobileDate(week.createdAt),
      updatedAt: normalizeMobileDate(week.updatedAt),
      startDate: normalizeMobileDate(week.startDate),
      endDate: normalizeMobileDate(week.endDate),
    })),
    weekRecipes: weekRecipes.map((weekRecipe) => ({
      ...weekRecipe,
      createdAt: normalizeMobileDate(weekRecipe.createdAt),
      updatedAt: normalizeMobileDate(weekRecipe.updatedAt),
      scheduledDate: normalizeMobileDate(weekRecipe.scheduledDate),
    })),
    groceryItems: groceryItems.map((groceryItem) => ({
      ...groceryItem,
      createdAt: normalizeMobileDate(groceryItem.createdAt),
      updatedAt: normalizeMobileDate(groceryItem.updatedAt),
    })),
    recipeBooks: recipeBooks.map((recipeBook) => ({
      ...recipeBook,
      createdAt: normalizeMobileDate(recipeBook.createdAt),
      updatedAt: normalizeMobileDate(recipeBook.updatedAt),
    })),
    groceryTemplates: groceryTemplates.map((groceryTemplate) => ({
      ...groceryTemplate,
      createdAt: normalizeMobileDate(groceryTemplate.createdAt),
      updatedAt: normalizeMobileDate(groceryTemplate.updatedAt),
    })),
    recipeRelations,
    versions: versions.filter((version) => visibleEntityTypes.has(version.entityType)).map((version) => ({
      entityType: version.entityType,
      entityId: version.entityId,
      clientId: version.clientId,
      version: version.version,
      deletedAt: normalizeMobileDate(version.deletedAt),
      updatedAt: normalizeMobileDate(version.updatedAt),
    })),
  };
}
