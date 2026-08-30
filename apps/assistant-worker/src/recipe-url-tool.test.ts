import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantRequestContext } from "./context";
import {
  createApprovedRecipeUrlImportTool,
  createRecipeUrlTool,
  extractRecipeFromHtml,
} from "./recipe-url-tool";

const sourceUrl = "https://www.halfbakedharvest.com/quick-cajun-chicken-and-rice/";
const recipeJsonLd = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Quick Cajun Chicken and Rice",
  recipeCategory: ["Main Course"],
  recipeIngredient: [
    "3 tablespoons salted butter",
    "1 1/2 pounds boneless chicken breasts, cubed",
    "1 cup dry white rice",
  ],
  recipeInstructions: [{
    "@type": "HowToStep",
    text: "1. Brown the chicken.2. Toast the rice.3. Cover and cook until the rice is tender.",
  }],
};
const recipeHtml = `<html><head><script type="application/ld+json">${JSON.stringify(recipeJsonLd)}</script></head></html>`;

test("extracts a mutation-ready recipe and repairs compressed instruction numbering", async () => {
  const result = await extractRecipeFromHtml({ html: recipeHtml, sourceUrl });

  assert.equal(result.recipe.name, "Quick Cajun Chicken and Rice");
  assert.match(result.sourceFingerprint, /^rfi_[0-9a-f]{64}$/u);
  assert.equal(result.recipe.emoji, "🍗");
  assert.equal(result.recipe.recipeLink, sourceUrl);
  assert.equal(result.recipe.mealType, "Dinner");
  assert.deepEqual(result.recipe.tags, ["Main Course", "Cajun", "Chicken", "Rice"]);
  assert.deepEqual(result.recipe.ingredients, [{
    items: [
      "3 tablespoons salted butter",
      "1 1/2 pounds boneless chicken breasts, cubed",
      "1 cup dry white rice",
    ],
  }]);
  assert.equal(
    result.recipe.recipeBody,
    "1. Brown the chicken.\n\n2. Toast the rice.\n\n3. Cover and cook until the rice is tender.",
  );
  assert.equal(result.warnings.length, 1);
});

test("repairs an obvious source typo without changing the ingredient quantity", async () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    ...recipeJsonLd,
    recipeIngredient: [
      "1-2 tablespoons cajun seasoning, us this to your taste",
    ],
  })}</script>`;

  const result = await extractRecipeFromHtml({ html, sourceUrl });

  assert.deepEqual(result.recipe.ingredients, [{
    items: ["1-2 tablespoons cajun seasoning, use this to your taste"],
  }]);
});

test("fetch tool follows a public redirect and returns the final source URL", async () => {
  const requestedUrls: string[] = [];
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = input.toString();
    requestedUrls.push(url);
    if (requestedUrls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "/canonical-recipe/" },
      });
    }
    return new Response(recipeHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }) as typeof fetch;
  const tool = createRecipeUrlTool({
    fetcher,
    loadVocabulary: async () => ({
      emojis: [{ value: "🍲", count: 4 }],
      mealTypes: [{ value: "Dinner", count: 8 }],
      tags: [{ value: "Weeknight", count: 6 }],
    }),
  });
  assert.ok(tool.execute);

  const result = await tool.execute({ url: "https://recipes.example.com/original" });

  assert.equal(result.recipe.recipeLink, "https://recipes.example.com/canonical-recipe/");
  assert.deepEqual(result.existingVocabulary, {
    emojis: [{ value: "🍲", count: 4 }],
    mealTypes: [{ value: "Dinner", count: 8 }],
    tags: [{ value: "Weeknight", count: 6 }],
  });
  assert.deepEqual(requestedUrls, [
    "https://recipes.example.com/original",
    "https://recipes.example.com/canonical-recipe/",
  ]);
});

test("rejects local and IP recipe URLs before fetching", async () => {
  let fetchCalls = 0;
  const fetcher = (async () => {
    fetchCalls += 1;
    return new Response(recipeHtml, { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const tool = createRecipeUrlTool({ fetcher });
  assert.ok(tool.execute);

  await assert.rejects(tool.execute({ url: "http://127.0.0.1/recipe" }), /public hostname/u);
  await assert.rejects(tool.execute({ url: "http://localhost/recipe" }), /public hostname/u);
  assert.equal(fetchCalls, 0);
});

test("rejects oversized and non-HTML responses", async () => {
  const oversizedTool = createRecipeUrlTool({
    fetcher: (async () => new Response("small", {
      headers: {
        "content-length": "2000001",
        "content-type": "text/html",
      },
    })) as typeof fetch,
  });
  assert.ok(oversizedTool.execute);
  await assert.rejects(
    oversizedTool.execute({ url: "https://recipes.example.com/large" }),
    /too large/u,
  );

  const imageTool = createRecipeUrlTool({
    fetcher: (async () => new Response("image", {
      headers: { "content-type": "image/jpeg" },
    })) as typeof fetch,
  });
  assert.ok(imageTool.execute);
  await assert.rejects(
    imageTool.execute({ url: "https://recipes.example.com/image" }),
    /did not return an HTML page/u,
  );
});

test("approval-gated URL import applies compact agent edits through the team mutation engine", async () => {
  const boundStatements: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          boundStatements.push({ sql, values });
          return {
            async first() {
              if (sql.includes("FROM team_membership")) {
                return { roleId: "owner", isSystemRole: 1, permissions: null };
              }
              if (sql.includes("defaultRecipeVisibility")) {
                return { defaultRecipeVisibility: "private" };
              }
              return null;
            },
          };
        },
      };
    },
    async batch(statements: D1PreparedStatement[]) {
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
  const context: AssistantRequestContext = {
    userId: "usr_1",
    teamId: "team_1",
    chatId: "chat_1",
    requestId: "req_1",
    runId: "run_1",
    maxOutputTokens: 4_000,
  };
  const candidate = await extractRecipeFromHtml({ html: recipeHtml, sourceUrl });
  const tool = createApprovedRecipeUrlImportTool({
    db,
    context,
    fetcher: (async () => new Response(recipeHtml, {
      headers: { "content-type": "text/html" },
    })) as typeof fetch,
  });
  assert.equal(tool.needsApproval, true);
  assert.ok(tool.execute);

  const result = await tool.execute({
    url: sourceUrl,
    sourceFingerprint: candidate.sourceFingerprint,
    emoji: "🍲",
    tags: ["Dinner", "Cajun"],
    ingredientEdits: [{ position: 3, value: "1 cup dry white rice, rinsed" }],
    instructionEdits: [{ position: 2, value: "Toast the rice gently." }],
  });

  assert.equal(result.success, true);
  assert.match(result.recipeId, /^rcp_/u);
  const insertedValues = boundStatements
    .find(({ sql }) => sql.startsWith("INSERT INTO recipes"))?.values;
  assert.ok(insertedValues);
  assert.equal(insertedValues.includes(sourceUrl), true);
  assert.equal(insertedValues.includes("🍲"), true);
  assert.equal(insertedValues.includes('["Dinner","Cajun"]'), true);
  assert.equal(
    insertedValues.includes('[{"items":["3 tablespoons salted butter","1 1/2 pounds boneless chicken breasts, cubed","1 cup dry white rice, rinsed"]}]'),
    true,
  );
  assert.equal(
    insertedValues.includes("1. Brown the chicken.\n\n2. Toast the rice gently.\n\n3. Cover and cook until the rice is tender."),
    true,
  );
});
