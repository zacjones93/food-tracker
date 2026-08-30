import assert from "node:assert/strict";
import test from "node:test";

import type { Executor } from "@cloudflare/codemode";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { createAssistantCodeMode } from "./code-mode-tool";
import { RECIPE_URL_IMPORT_POLICY } from "./assistant-policy";
import {
  READ_ONLY_TOOL_MANIFEST,
  type ReadOnlyToolNamespace,
} from "./tool-policy";

test("recipe URL creates go directly to the approval-gated mutation", () => {
  assert.match(RECIPE_URL_IMPORT_POLICY, /call create_recipe_from_url immediately after extraction/u);
  assert.match(RECIPE_URL_IMPORT_POLICY, /tool's approval UI is the confirmation/u);
  assert.match(RECIPE_URL_IMPORT_POLICY, /never return an empty response/u);
  assert.match(RECIPE_URL_IMPORT_POLICY, /do not copy the full recipe into apply_team_changes/u);
  assert.match(RECIPE_URL_IMPORT_POLICY, /existingVocabulary from the authenticated active team's recipes/u);
  assert.match(RECIPE_URL_IMPORT_POLICY, /never add irrelevant metadata merely because it is common/u);
});

test("Code Mode returns actionable executor errors for model retries", async () => {
  const executor: Executor = {
    async execute() {
      return {
        result: null,
        error: "ReferenceError: external_recipeSearch is not defined",
      };
    },
  };
  const recipeSearch = toolDefinition({
    name: "search",
    description: "Search recipes by text.",
    inputSchema: z.object({ text: z.string().optional() }),
    outputSchema: z.object({
      ok: z.literal(true),
      data: z.object({
        items: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    }),
  }).server(async () => ({ ok: true as const, data: { items: [] } }));
  const { tool, systemPrompt } = createAssistantCodeMode({
    executor,
    namespaces: [{ name: "recipes", tools: [recipeSearch] }],
  });
  const execute = tool.execute;
  assert.ok(execute);

  const output = await execute({
    typescriptCode: "return await external_recipeSearch({ text: 'chicken' });",
  });

  assert.deepEqual(output, {
    success: false,
    error: {
      name: "Error",
      message: "ReferenceError: external_recipeSearch is not defined",
    },
    logs: undefined,
  });
  assert.equal(tool.name, "execute_typescript");
  assert.match(systemPrompt, /external_recipeSearch/u);
  assert.match(systemPrompt, /text\?: string/u);
  assert.doesNotMatch(systemPrompt, /declare const recipes|codemode_execute/u);
});

test("Code Mode generates the complete external API mapping from tool schemas", () => {
  const executor: Executor = {
    async execute() {
      return { result: null };
    },
  };
  const namespaces = Object.entries(READ_ONLY_TOOL_MANIFEST).map(
    ([name, toolNames]) => ({
      name: name as ReadOnlyToolNamespace["name"],
      tools: toolNames.map((toolName) =>
        toolDefinition({
          name: toolName,
          description: `${name}.${toolName}`,
          inputSchema: z.object({ query: z.string().optional() }),
          outputSchema: z.object({ items: z.array(z.string()) }),
        }).server(async () => ({ items: [] })),
      ),
    }),
  );

  const { systemPrompt } = createAssistantCodeMode({ executor, namespaces });

  for (const functionName of [
    "external_recipeSearch",
    "external_recipeGetMany",
    "external_recipeFacets",
    "external_weekSearch",
    "external_weekGetMany",
    "external_weeksFindForRecipes",
    "external_recipeBookSearch",
    "external_groceryTemplateSearch",
    "external_groceryItemSearch",
    "external_weekRecipeSearch",
    "external_recipeRelationSearch",
    "external_getFoodPlanningSettings",
  ]) {
    assert.match(systemPrompt, new RegExp(`\\b${functionName}\\b`, "u"));
  }
  assert.match(systemPrompt, /query\?: string/u);
  assert.match(systemPrompt, /Promise<External_recipeSearchOutput>/u);
  assert.match(
    systemPrompt,
    /Use execute_typescript for every retrieval operation/u,
  );
  assert.doesNotMatch(systemPrompt, /external_fetchWeather/u);
});
