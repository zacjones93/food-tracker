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
      description: "Search only the authenticated team's recipe library.",
      inputSchema: recipeSearchInputSchema,
      outputSchema: recipeSearchResultSchema,
    }).server((input) => service.recipes.search(input)),
    toolDefinition({
      name: "getMany",
      description: "Load selected recipes from the authenticated team.",
      inputSchema: recipeGetManyInputSchema,
      outputSchema: recipeGetManyResultSchema,
    }).server((input) => service.recipes.getMany(input)),
  ];
  const weekTools: Tool[] = [
    toolDefinition({
      name: "search",
      description: "Search meal-plan weeks for the authenticated team.",
      inputSchema: weekSearchInputSchema,
      outputSchema: weekSearchResultSchema,
    }).server((input) => service.weeks.search(input)),
    toolDefinition({
      name: "getMany",
      description: "Load selected meal-plan weeks from the authenticated team.",
      inputSchema: weekGetManyInputSchema,
      outputSchema: weekGetManyResultSchema,
    }).server((input) => service.weeks.getMany(input)),
    toolDefinition({
      name: "findForRecipes",
      description: "Find weeks containing selected recipes for the authenticated team.",
      inputSchema: weeksFindForRecipesInputSchema,
      outputSchema: weeksFindForRecipesResultSchema,
    }).server((input) => service.weeks.findForRecipes(input)),
  ];

  return [
    { name: "recipes", tools: recipeTools },
    { name: "weeks", tools: weekTools },
  ];
}
