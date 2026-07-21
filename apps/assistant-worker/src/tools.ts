import { tanstackTools } from "@cloudflare/codemode/tanstack-ai";
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
import { RECIPE_NAMESPACE_TYPES, WEEK_NAMESPACE_TYPES } from "./code-mode-contract";
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

  const recipeTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search the authenticated team's recipes. Input uses text, mealTypes[], filters, limit, and cursor. Returns {ok:true,data:{items,nextCursor,appliedFilters}} or {ok:false,error}. Example: recipes.search({text:'chicken',mealTypes:['Dinner'],limit:3}).",
      inputSchema: recipeSearchInputSchema,
      outputSchema: recipeSearchResultSchema,
    }).server((input) => service.recipes.search(input)),
    toolDefinition({
      name: "getMany",
      description: "Load authenticated-team recipe details by recipe IDs, never names. Returns {ok:true,data:{items,missingIds}} or {ok:false,error}. Example: recipes.getMany({ids:['recipe-id'],include:['ingredients','instructions']}).",
      inputSchema: recipeGetManyInputSchema,
      outputSchema: recipeGetManyResultSchema,
    }).server((input) => service.recipes.getMany(input)),
  ];
  const weekTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search authenticated-team meal-plan weeks. Use onDate for current-week resolution and includeRecipes:true for scheduled recipes. Returns {ok:true,data:{items,nextCursor,appliedFilters}} or {ok:false,error}.",
      inputSchema: weekSearchInputSchema,
      outputSchema: weekSearchResultSchema,
    }).server((input) => service.weeks.search(input)),
    toolDefinition({
      name: "getMany",
      description: "Load authenticated-team meal-plan weeks by IDs. Returns {ok:true,data:{items,missingIds}} or {ok:false,error}.",
      inputSchema: weekGetManyInputSchema,
      outputSchema: weekGetManyResultSchema,
    }).server((input) => service.weeks.getMany(input)),
    toolDefinition({
      name: "findForRecipes",
      description: "Find authenticated-team weeks containing recipe IDs. Returns {ok:true,data:{matches,nextCursor}} or {ok:false,error}.",
      inputSchema: weeksFindForRecipesInputSchema,
      outputSchema: weeksFindForRecipesResultSchema,
    }).server((input) => service.weeks.findForRecipes(input)),
  ];

  return [
    { name: "recipes", tools: recipeTools },
    { name: "weeks", tools: weekTools },
  ];
}

export function createCodeModeToolProviders(namespaces: ReadOnlyToolNamespace[]) {
  return namespaces.map((namespace) => ({
    ...tanstackTools(namespace.tools, namespace.name),
    types: namespace.name === "recipes" ? RECIPE_NAMESPACE_TYPES : WEEK_NAMESPACE_TYPES,
  }));
}
