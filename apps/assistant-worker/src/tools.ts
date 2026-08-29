import { toolDefinition, type Tool } from "@tanstack/ai";

import {
  recipeGetManyInputSchema,
  recipeGetManyResultSchema,
  recipeSearchInputSchema,
  recipeSearchResultSchema,
  weekGetManyInputSchema,
  weekGetManyResultSchema,
  weekSearchInputSchema,
  weekSearchResultSchema,
  weeksFindForRecipesInputSchema,
  weeksFindForRecipesResultSchema,
} from "../../web/src/lib/ai/retrieval/contracts";
import { createRetrievalService } from "../../web/src/lib/ai/retrieval/service";
import type { AssistantRequestContext } from "./context";
import { workerRetrievalCorpusProvider } from "./corpus";
import {
  ASSISTANT_TEAM_PERMISSIONS,
  assertAssistantTeamPermission,
} from "./authorization";
import {
  createAdditionalReadOnlyNamespaces,
  getAdditionalRecipeTools,
} from "./planning-read-tools";
import type { ReadOnlyToolNamespace } from "./tool-policy";

export function createReadOnlyToolNamespaces({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): ReadOnlyToolNamespace[] {
  const service = createRetrievalService({
    context: { db, ...context },
    provider: workerRetrievalCorpusProvider,
  });

  async function assertRecipeAccess(): Promise<void> {
    await assertAssistantTeamPermission({
      db,
      context,
      permission: ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
    });
  }

  async function assertScheduleAccess(): Promise<void> {
    await assertAssistantTeamPermission({
      db,
      context,
      permission: ASSISTANT_TEAM_PERMISSIONS.accessSchedules,
    });
  }

  const recipeTools: Tool[] = [
    toolDefinition({
      name: "search",
      description:
        "Search the authenticated team's recipes. Input uses text, mealTypes[], filters, limit, and cursor. Returns {ok:true,data:{items,nextCursor,appliedFilters}} or {ok:false,error}. Example: recipes.search({text:'chicken',mealTypes:['Dinner'],limit:3}).",
      inputSchema: recipeSearchInputSchema,
      outputSchema: recipeSearchResultSchema,
    }).server(async (input) => {
      await assertRecipeAccess();
      return service.recipes.search(input);
    }),
    toolDefinition({
      name: "getMany",
      description:
        "Load authenticated-team recipe details by recipe IDs, never names. Returns {ok:true,data:{items,missingIds}} or {ok:false,error}. Example: recipes.getMany({ids:['recipe-id'],include:['ingredients','instructions']}).",
      inputSchema: recipeGetManyInputSchema,
      outputSchema: recipeGetManyResultSchema,
    }).server(async (input) => {
      await assertRecipeAccess();
      return service.recipes.getMany(input);
    }),
    ...getAdditionalRecipeTools({ db, context }),
  ];
  const weekTools: Tool[] = [
    toolDefinition({
      name: "search",
      description:
        "Search authenticated-team meal-plan weeks. Use onDate for current-week resolution and includeRecipes:true for scheduled recipes. Returns {ok:true,data:{items,nextCursor,appliedFilters}} or {ok:false,error}.",
      inputSchema: weekSearchInputSchema,
      outputSchema: weekSearchResultSchema,
    }).server(async (input) => {
      await assertScheduleAccess();
      return service.weeks.search(input);
    }),
    toolDefinition({
      name: "getMany",
      description:
        "Load authenticated-team meal-plan weeks by IDs. Returns {ok:true,data:{items,missingIds}} or {ok:false,error}.",
      inputSchema: weekGetManyInputSchema,
      outputSchema: weekGetManyResultSchema,
    }).server(async (input) => {
      await assertScheduleAccess();
      return service.weeks.getMany(input);
    }),
    toolDefinition({
      name: "findForRecipes",
      description:
        "Find authenticated-team weeks containing recipe IDs. Returns {ok:true,data:{matches,nextCursor}} or {ok:false,error}.",
      inputSchema: weeksFindForRecipesInputSchema,
      outputSchema: weeksFindForRecipesResultSchema,
    }).server(async (input) => {
      await assertScheduleAccess();
      return service.weeks.findForRecipes(input);
    }),
  ];

  return [
    { name: "recipes", tools: recipeTools },
    { name: "weeks", tools: weekTools },
    ...createAdditionalReadOnlyNamespaces({ db, context }),
  ];
}
