import { toolDefinition, type Tool } from "@tanstack/ai";
import { z } from "zod";

import {
  ASSISTANT_TEAM_PERMISSIONS,
  assertAssistantTeamPermission,
  type AssistantTeamPermission,
} from "./authorization";
import type { AssistantRequestContext } from "./context";
import type { ReadOnlyToolNamespace } from "./tool-policy";

const MAX_RESULTS = 50;
const identifierSchema = z.string().trim().min(1).max(255);
const identifierListSchema = z.array(identifierSchema).max(MAX_RESULTS);
const searchTextSchema = z.string().trim().min(1).max(500).optional();
const limitSchema = z.number().int().min(1).max(MAX_RESULTS).default(20);
const recordSchema = z.record(z.string(), z.unknown());
const searchResultSchema = z.object({
  items: z.array(recordSchema),
  count: z.number().int().min(0),
});

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (["tags", "ingredients", "template"].includes(key)) {
        return [key, parseJson(value)];
      }
      if (["checked", "made", "isDefault", "autoAddIngredientsToGrocery"].includes(key)) {
        return [key, value === 1 || value === true];
      }
      if (
        ["createdAt", "updatedAt", "scheduledDate", "startDate", "endDate"].includes(key) &&
        typeof value === "number"
      ) {
        return [key, new Date(value * 1_000).toISOString()];
      }
      return [key, value];
    }),
  );
}

function placeholders(length: number): string {
  return Array.from({ length }, () => "?").join(", ");
}

async function authorizedQuery({
  db,
  context,
  permission,
  sql,
  bindings,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  permission: AssistantTeamPermission;
  sql: string;
  bindings: unknown[];
}): Promise<{ items: Record<string, unknown>[]; count: number }> {
  await assertAssistantTeamPermission({ db, context, permission });
  const result = await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>();
  const items = result.results.map(normalizeRecord);
  return { items, count: items.length };
}

function createRecipeFacetsTool({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Tool {
  return toolDefinition({
    name: "facets",
    description: "List the active team's available recipe meal types, difficulties, and tags.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      mealTypes: z.array(z.string()),
      difficulties: z.array(z.string()),
      tags: z.array(z.string()),
    }),
  }).server(async () => {
    await assertAssistantTeamPermission({
      db,
      context,
      permission: ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
    });
    const result = await db.prepare(
      `SELECT mealType, difficulty, tags
         FROM recipes
        WHERE teamId = ?`,
    ).bind(context.teamId).all<{
      difficulty: string | null;
      mealType: string | null;
      tags: string | null;
    }>();
    const mealTypes = new Set<string>();
    const difficulties = new Set<string>();
    const tags = new Set<string>();
    for (const recipe of result.results) {
      if (recipe.mealType) mealTypes.add(recipe.mealType);
      if (recipe.difficulty) difficulties.add(recipe.difficulty);
      const parsedTags = parseJson(recipe.tags);
      if (Array.isArray(parsedTags)) {
        for (const tag of parsedTags) if (typeof tag === "string") tags.add(tag);
      }
    }
    return {
      mealTypes: [...mealTypes].sort(),
      difficulties: [...difficulties].sort(),
      tags: [...tags].sort(),
    };
  });
}

export function createAdditionalReadOnlyNamespaces({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): ReadOnlyToolNamespace[] {
  const recipeBookTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search recipe books readable by the active team. Team books and global books are returned; ownershipScope distinguishes them.",
      inputSchema: z.object({ text: searchTextSchema, ids: identifierListSchema.optional(), limit: limitSchema }),
      outputSchema: searchResultSchema,
    }).server(async ({ text, ids, limit }) => {
      const conditions = ["(teamId = ? OR teamId IS NULL)"];
      const bindings: unknown[] = [context.teamId];
      if (text) {
        conditions.push("lower(name) LIKE ?");
        bindings.push(`%${text.toLowerCase()}%`);
      }
      if (ids?.length) {
        conditions.push(`id IN (${placeholders(ids.length)})`);
        bindings.push(...ids);
      }
      bindings.push(limit);
      return authorizedQuery({
        db,
        context,
        permission: ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
        sql: `SELECT id, name, teamId,
                     CASE WHEN teamId = ? THEN 'team' ELSE 'global' END AS ownershipScope,
                     createdAt, updatedAt
                FROM recipe_books
               WHERE ${conditions.join(" AND ")}
               ORDER BY lower(name), id
               LIMIT ?`,
        bindings: [context.teamId, ...bindings],
      });
    }),
  ];

  const groceryTemplateTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search grocery templates readable by the active team, including the global default template.",
      inputSchema: z.object({
        text: searchTextSchema,
        ids: identifierListSchema.optional(),
        includeItems: z.boolean().default(true),
        limit: limitSchema,
      }),
      outputSchema: searchResultSchema,
    }).server(async ({ text, ids, includeItems, limit }) => {
      const conditions = ["(teamId = ? OR isDefault = 1)"];
      const bindings: unknown[] = [context.teamId];
      if (text) {
        conditions.push("lower(name) LIKE ?");
        bindings.push(`%${text.toLowerCase()}%`);
      }
      if (ids?.length) {
        conditions.push(`id IN (${placeholders(ids.length)})`);
        bindings.push(...ids);
      }
      bindings.push(limit);
      return authorizedQuery({
        db,
        context,
        permission: ASSISTANT_TEAM_PERMISSIONS.accessGroceryTemplates,
        sql: `SELECT id, name, teamId, isDefault,
                     ${includeItems ? "template" : "NULL AS template"},
                     createdAt, updatedAt
                FROM grocery_list_templates
               WHERE ${conditions.join(" AND ")}
               ORDER BY isDefault DESC, lower(name), id
               LIMIT ?`,
        bindings,
      });
    }),
  ];

  const groceryItemTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search grocery items belonging to active-team weeks. At least one week ID is required.",
      inputSchema: z.object({
        weekIds: identifierListSchema.min(1),
        text: searchTextSchema,
        checked: z.boolean().optional(),
        categories: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
        limit: limitSchema,
      }),
      outputSchema: searchResultSchema,
    }).server(async ({ weekIds, text, checked, categories, limit }) => {
      const conditions = [`gi.weekId IN (${placeholders(weekIds.length)})`];
      const bindings: unknown[] = [context.teamId, ...weekIds];
      if (text) {
        conditions.push("lower(gi.name) LIKE ?");
        bindings.push(`%${text.toLowerCase()}%`);
      }
      if (checked !== undefined) {
        conditions.push("gi.checked = ?");
        bindings.push(checked ? 1 : 0);
      }
      if (categories?.length) {
        conditions.push(`gi.category IN (${placeholders(categories.length)})`);
        bindings.push(...categories);
      }
      bindings.push(limit);
      return authorizedQuery({
        db,
        context,
        permission: ASSISTANT_TEAM_PERMISSIONS.accessSchedules,
        sql: `SELECT gi.id, gi.weekId, gi.name, gi.checked, gi."order", gi.category,
                     gi.createdAt, gi.updatedAt
                FROM grocery_items gi
                JOIN weeks w ON w.id = gi.weekId AND w.teamId = ?
               WHERE ${conditions.join(" AND ")}
               ORDER BY gi.weekId, gi."order", gi.id
               LIMIT ?`,
        bindings,
      });
    }),
  ];

  const weekRecipeTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search recipe assignments on active-team weeks and return assignment IDs used for updates or removal.",
      inputSchema: z.object({
        weekIds: identifierListSchema.optional(),
        recipeIds: identifierListSchema.optional(),
        made: z.boolean().optional(),
        limit: limitSchema,
      }),
      outputSchema: searchResultSchema,
    }).server(async ({ weekIds, recipeIds, made, limit }) => {
      const conditions = ["w.teamId = ?"];
      const bindings: unknown[] = [context.teamId];
      if (weekIds?.length) {
        conditions.push(`wr.weekId IN (${placeholders(weekIds.length)})`);
        bindings.push(...weekIds);
      }
      if (recipeIds?.length) {
        conditions.push(`wr.recipeId IN (${placeholders(recipeIds.length)})`);
        bindings.push(...recipeIds);
      }
      if (made !== undefined) {
        conditions.push("wr.made = ?");
        bindings.push(made ? 1 : 0);
      }
      bindings.push(limit);
      return authorizedQuery({
        db,
        context,
        permission: ASSISTANT_TEAM_PERMISSIONS.accessSchedules,
        sql: `SELECT wr.id, wr.weekId, wr.recipeId, r.name AS recipeName,
                     wr.scheduledDate, wr."order", wr.made, wr.createdAt, wr.updatedAt
                FROM week_recipes wr
                JOIN weeks w ON w.id = wr.weekId
                JOIN recipes r ON r.id = wr.recipeId
               WHERE ${conditions.join(" AND ")}
               ORDER BY wr.weekId, wr."order", wr.id
               LIMIT ?`,
        bindings,
      });
    }),
  ];

  const recipeRelationTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search side/accompaniment relationships where both recipes belong to the active team.",
      inputSchema: z.object({ recipeIds: identifierListSchema.min(1), limit: limitSchema }),
      outputSchema: searchResultSchema,
    }).server(async ({ recipeIds, limit }) => {
      const recipePlaceholders = placeholders(recipeIds.length);
      return authorizedQuery({
        db,
        context,
        permission: ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
        sql: `SELECT rr.id, rr.mainRecipeId, main.name AS mainRecipeName,
                     rr.sideRecipeId, side.name AS sideRecipeName,
                     rr.relationType, rr."order", rr.createdAt, rr.updatedAt
                FROM recipe_relations rr
                JOIN recipes main ON main.id = rr.mainRecipeId AND main.teamId = ?
                JOIN recipes side ON side.id = rr.sideRecipeId AND side.teamId = ?
               WHERE (rr.mainRecipeId IN (${recipePlaceholders})
                   OR rr.sideRecipeId IN (${recipePlaceholders}))
               ORDER BY rr.mainRecipeId, rr."order", rr.id
               LIMIT ?`,
        bindings: [context.teamId, context.teamId, ...recipeIds, ...recipeIds, limit],
      });
    }),
  ];

  const settingsTools: Tool[] = [
    toolDefinition({
      name: "getFoodPlanning",
      description: "Get active-team recipe visibility defaults and automatic grocery behavior. AI budgets and account settings are intentionally excluded.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        recipeVisibilityMode: z.string(),
        defaultRecipeVisibility: z.string(),
        autoAddIngredientsToGrocery: z.boolean(),
      }),
    }).server(async () => {
      await assertAssistantTeamPermission({
        db,
        context,
        permission: ASSISTANT_TEAM_PERMISSIONS.accessSchedules,
      });
      const settings = await db.prepare(
        `SELECT recipeVisibilityMode, defaultRecipeVisibility, autoAddIngredientsToGrocery
           FROM team_settings
          WHERE teamId = ?
          LIMIT 1`,
      ).bind(context.teamId).first<{
        autoAddIngredientsToGrocery: number;
        defaultRecipeVisibility: string;
        recipeVisibilityMode: string;
      }>();
      return {
        recipeVisibilityMode: settings?.recipeVisibilityMode ?? "all",
        defaultRecipeVisibility: settings?.defaultRecipeVisibility ?? "public",
        autoAddIngredientsToGrocery: settings?.autoAddIngredientsToGrocery !== 0,
      };
    }),
  ];

  return [
    { name: "recipeBooks", tools: recipeBookTools },
    { name: "groceryTemplates", tools: groceryTemplateTools },
    { name: "groceryItems", tools: groceryItemTools },
    { name: "weekRecipes", tools: weekRecipeTools },
    { name: "recipeRelations", tools: recipeRelationTools },
    { name: "settings", tools: settingsTools },
  ];
}

export function getAdditionalRecipeTools({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Tool[] {
  return [createRecipeFacetsTool({ db, context })];
}
