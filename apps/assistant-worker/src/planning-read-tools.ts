import { toolDefinition, type Tool } from "@tanstack/ai";
import { z } from "zod";

import foodPlanningRetrievalModule from "../../web/src/lib/ai/retrieval/food-planning";
import {
  ASSISTANT_TEAM_PERMISSIONS,
  assertAssistantTeamPermission,
} from "./authorization";
import type { AssistantRequestContext } from "./context";
import type { ReadOnlyToolNamespace } from "./tool-policy";

const {
  createD1FoodPlanningQueryPort,
  createFoodPlanningRetrieval,
  MAX_FOOD_PLANNING_RESULTS,
} = foodPlanningRetrievalModule;

const identifierSchema = z.string().trim().min(1).max(255);
const identifierListSchema = z.array(identifierSchema).max(MAX_FOOD_PLANNING_RESULTS);
const searchTextSchema = z.string().trim().min(1).max(500).optional();
const limitSchema = z.number().int().min(1).max(MAX_FOOD_PLANNING_RESULTS).default(20);
const recordSchema = z.record(z.string(), z.unknown());
const searchResultSchema = z.object({
  items: z.array(recordSchema),
  count: z.number().int().min(0),
});

function createRecipeFacetsTool({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Tool {
  const retrieval = createFoodPlanningRetrieval({
    query: createD1FoodPlanningQueryPort(db),
    teamId: context.teamId,
  });
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
    return retrieval.recipeFacets.get();
  });
}

export function createAdditionalReadOnlyNamespaces({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): ReadOnlyToolNamespace[] {
  const retrieval = createFoodPlanningRetrieval({
    query: createD1FoodPlanningQueryPort(db),
    teamId: context.teamId,
  });
  const authorize = (
    permission: Parameters<typeof assertAssistantTeamPermission>[0]["permission"],
  ) => assertAssistantTeamPermission({ db, context, permission });

  const recipeBookTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search recipe books readable by the active team. Team books and global books are returned; ownershipScope distinguishes them.",
      inputSchema: z.object({ text: searchTextSchema, ids: identifierListSchema.optional(), limit: limitSchema }),
      outputSchema: searchResultSchema,
    }).server(async (input) => {
      await authorize(ASSISTANT_TEAM_PERMISSIONS.accessRecipes);
      return retrieval.recipeBooks.search({ ...input, limit: input.limit ?? 20 });
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
    }).server(async (input) => {
      await authorize(ASSISTANT_TEAM_PERMISSIONS.accessGroceryTemplates);
      return retrieval.groceryTemplates.search({
        ...input,
        includeItems: input.includeItems ?? true,
        limit: input.limit ?? 20,
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
    }).server(async (input) => {
      await authorize(ASSISTANT_TEAM_PERMISSIONS.accessSchedules);
      return retrieval.groceryItems.search({ ...input, limit: input.limit ?? 20 });
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
    }).server(async (input) => {
      await authorize(ASSISTANT_TEAM_PERMISSIONS.accessSchedules);
      return retrieval.weekRecipes.search({ ...input, limit: input.limit ?? 20 });
    }),
  ];

  const recipeRelationTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search side/accompaniment relationships where both recipes belong to the active team.",
      inputSchema: z.object({ recipeIds: identifierListSchema.min(1), limit: limitSchema }),
      outputSchema: searchResultSchema,
    }).server(async (input) => {
      await authorize(ASSISTANT_TEAM_PERMISSIONS.accessRecipes);
      return retrieval.recipeRelations.search({ ...input, limit: input.limit ?? 20 });
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
      await authorize(ASSISTANT_TEAM_PERMISSIONS.accessSchedules);
      return retrieval.settings.get();
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
