import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeCase,
  canonicalizeLegacyDate,
  canonicalizeNullableString,
  canonicalizeTags,
} from "./ai/retrieval/canonicalization";
import {
  recipeSearchInputSchema,
  weekSearchInputSchema,
} from "./ai/retrieval/contracts";
import { createRetrievalService } from "./ai/retrieval/service";
import type {
  RecipeRetrievalRecord,
  RetrievalContext,
  RetrievalCorpus,
  RetrievalCorpusProvider,
  WeekRecipeRetrievalRecord,
  WeekRetrievalRecord,
} from "./ai/retrieval/types";

const TEAM_A = "team_a";
const TEAM_B = "team_b";

const seededCorpus: RetrievalCorpus = {
  recipes: [
    recipe({ id: "rcp_alpha", name: "Alpha Pasta" }),
    recipe({
      id: "rcp_broccoli",
      name: "Broccoli Bowl",
      tags: ["Quick", "Dinner"],
      ingredients: [{ title: "Main", items: ["2 heads broccoli", "rice"] }],
      recipeBody: "Finish with fresh lemon juice and herbs.",
      mealType: "Dinner",
      difficulty: "Easy",
      lastMadeDate: 1_735_689_600,
    }),
    recipe({ id: "rcp_middle", name: "Middle Curry", tags: ["dinner"] }),
    recipe({
      id: "rcp_zulu",
      name: "Zulu Tofu",
      tags: "[\" Vegetarian \", \"QUICK\"]",
      ingredients: [{ items: ["tofu", "ginger"] }],
      mealType: "null",
      difficulty: "NULL",
      lastMadeDate: "null",
    }),
    recipe({
      id: "rcp_secret",
      teamId: TEAM_B,
      name: "Secret Tofu",
      tags: ["vegetarian"],
      ingredients: [{ items: ["tofu"] }],
    }),
  ],
  weeks: [
    week({
      id: "wk_current",
      name: "Current July Week",
      status: "CURRENT",
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    }),
    week({
      id: "wk_recent",
      name: "Recent Week",
      status: "archived",
      startDate: "2026-07-13",
      endDate: "2026-07-19",
    }),
    week({
      id: "wk_archive_gem",
      name: "Archive Gem",
      status: "ARCHIVED",
      startDate: "2020-01-06",
      endDate: "2020-01-12",
    }),
    week({
      id: "wk_secret",
      teamId: TEAM_B,
      name: "Secret Team Week",
      status: "current",
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    }),
  ],
  weekRecipes: [
    weekRecipe({ id: "wr_current_broccoli", weekId: "wk_current", recipeId: "rcp_broccoli" }),
    weekRecipe({ id: "wr_archive_zulu", weekId: "wk_archive_gem", recipeId: "rcp_zulu" }),
    // These intentionally malformed cross-team links prove both sides of the join are scoped.
    weekRecipe({ id: "wr_a_to_b", weekId: "wk_current", recipeId: "rcp_secret" }),
    weekRecipe({ id: "wr_b_to_a", weekId: "wk_secret", recipeId: "rcp_broccoli" }),
  ],
};

test("canonicalizes sentinel strings, case, tags, and legacy epoch dates", () => {
  assert.equal(canonicalizeNullableString(" NULL "), null);
  assert.equal(canonicalizeCase("  DINNER  "), "dinner");
  assert.deepEqual(canonicalizeTags('[" Quick ", "quick", "DINNER"]'), ["dinner", "quick"]);
  assert.equal(canonicalizeLegacyDate(1_735_689_600)?.toISOString(), "2025-01-01T00:00:00.000Z");
  assert.equal(
    canonicalizeLegacyDate(1_735_689_600_000)?.toISOString(),
    "2025-01-01T00:00:00.000Z",
  );
  assert.equal(canonicalizeLegacyDate("2026-02-30"), null);
});

test("strict model inputs cannot control user or team scope", () => {
  assert.equal(
    recipeSearchInputSchema.safeParse({ tagsAny: ["quick"], teamId: TEAM_B }).success,
    false,
  );
  assert.equal(
    weekSearchInputSchema.safeParse({ statuses: ["current"], userId: "usr_attacker" }).success,
    false,
  );
});

test("applies tag filters before limit and finds a match beyond the old first page", async () => {
  const service = createSeededService(TEAM_A);
  const result = await service.recipes.search({ tagsAny: ["VEGETARIAN"], limit: 1 });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.items.map(({ id }) => id), ["rcp_zulu"]);
  assert.deepEqual(result.data.items[0]?.tags, ["quick", "vegetarian"]);
  assert.deepEqual(result.data.items[0]?.dataQualityWarnings, [
    "meal_type_unset_or_sentinel",
    "difficulty_unset_or_sentinel",
  ]);
});

test("searches ingredients and recipe body with inspectable relevance evidence", async () => {
  const service = createSeededService(TEAM_A);
  const result = await service.recipes.search({ text: "broccoli lemon", limit: 10 });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.items.map(({ id }) => id), ["rcp_broccoli"]);
  assert.deepEqual(result.data.items[0]?.relevance.matchedFields, [
    "ingredients",
    "instructions",
    "name",
  ]);
  assert.deepEqual(result.data.items[0]?.relevance.matchedTerms, ["broccoli", "lemon"]);
  assert.equal("ingredients" in result.data.items[0]!, false);
});

test("returns explicit recipe details and authorized history only", async () => {
  const service = createSeededService(TEAM_A);
  const result = await service.recipes.getMany({
    ids: ["rcp_broccoli", "rcp_secret"],
    include: ["ingredients", "instructions", "history"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.items.map(({ id }) => id), ["rcp_broccoli"]);
  assert.deepEqual(result.data.missingIds, ["rcp_secret"]);
  assert.deepEqual(result.data.items[0]?.ingredients, ["2 heads broccoli", "rice"]);
  assert.deepEqual(result.data.items[0]?.history?.map(({ weekId }) => weekId), ["wk_current"]);
});

test("uses deterministic recipe cursors without duplicates", async () => {
  const service = createSeededService(TEAM_A);
  const firstPage = await service.recipes.search({ limit: 2 });

  assert.equal(firstPage.ok, true);
  if (!firstPage.ok) return;
  assert.deepEqual(firstPage.data.items.map(({ id }) => id), ["rcp_alpha", "rcp_broccoli"]);
  assert.ok(firstPage.data.nextCursor);

  const secondPage = await service.recipes.search({
    limit: 2,
    cursor: firstPage.data.nextCursor!,
  });
  assert.equal(secondPage.ok, true);
  if (!secondPage.ok) return;
  assert.deepEqual(secondPage.data.items.map(({ id }) => id), ["rcp_middle", "rcp_zulu"]);
});

test("applies week name filtering before limit so old weeks remain searchable", async () => {
  const service = createSeededService(TEAM_A);
  const result = await service.weeks.search({ text: "archive gem", limit: 1 });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.items.map(({ id }) => id), ["wk_archive_gem"]);
});

test("searches weeks by normalized status, date range, and contained recipe", async () => {
  const service = createSeededService(TEAM_A);
  const result = await service.weeks.search({
    statuses: ["current"],
    onDate: "2026-07-21",
    from: "2026-07-01",
    to: "2026-07-31",
    containsRecipeIds: ["rcp_broccoli"],
    includeRecipes: true,
    limit: 10,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.items.map(({ id }) => id), ["wk_current"]);
  assert.equal(result.data.items[0]?.recipeCount, 1);
  assert.deepEqual(result.data.items[0]?.recipes?.map(({ recipeId }) => recipeId), [
    "rcp_broccoli",
  ]);
});

test("getMany and findForRecipes exclude cross-team weeks and relationships", async () => {
  const service = createSeededService(TEAM_A);
  const weeksResult = await service.weeks.getMany({
    ids: ["wk_current", "wk_secret"],
    includeRecipes: true,
  });
  const historyResult = await service.weeks.findForRecipes({
    recipeIds: ["rcp_broccoli"],
    limit: 10,
  });

  assert.equal(weeksResult.ok, true);
  if (weeksResult.ok) {
    assert.deepEqual(weeksResult.data.items.map(({ id }) => id), ["wk_current"]);
    assert.deepEqual(weeksResult.data.missingIds, ["wk_secret"]);
    assert.equal(weeksResult.data.items[0]?.recipeCount, 1);
  }

  assert.equal(historyResult.ok, true);
  if (historyResult.ok)
    assert.deepEqual(historyResult.data.matches.map(({ week }) => week.id), ["wk_current"]);
});

test("returns structured errors for no matches and invalid cursors", async () => {
  const service = createSeededService(TEAM_A);
  const noMatches = await service.recipes.search({ text: "private truffle", limit: 10 });
  const badCursor = await service.weeks.search({ limit: 10, cursor: "not-a-cursor" });

  assert.equal(noMatches.ok, false);
  if (!noMatches.ok) assert.equal(noMatches.error.code, "NO_MATCHES");
  assert.equal(badCursor.ok, false);
  if (!badCursor.ok) assert.equal(badCursor.error.code, "INVALID_INPUT");
});

function createSeededService(teamId: string) {
  const provider: RetrievalCorpusProvider = {
    async load() {
      return seededCorpus;
    },
  };
  const context: RetrievalContext = {
    db: {} as RetrievalContext["db"],
    userId: "usr_test",
    teamId,
    chatId: "chat_test",
    requestId: "req_test",
  };

  return createRetrievalService({ context, provider });
}

function recipe(
  values: Partial<RecipeRetrievalRecord> & Pick<RecipeRetrievalRecord, "id" | "name">,
): RecipeRetrievalRecord {
  return {
    id: values.id,
    teamId: values.teamId ?? TEAM_A,
    name: values.name,
    emoji: values.emoji ?? null,
    tags: values.tags ?? null,
    mealType: values.mealType ?? null,
    difficulty: values.difficulty ?? null,
    visibility: values.visibility ?? "team",
    recipeLink: values.recipeLink ?? null,
    recipeBookId: values.recipeBookId ?? null,
    page: values.page ?? null,
    lastMadeDate: values.lastMadeDate ?? null,
    mealsEatenCount: values.mealsEatenCount ?? 0,
    ingredients: values.ingredients ?? null,
    recipeBody: values.recipeBody ?? null,
  };
}

function week(
  values: Partial<WeekRetrievalRecord> & Pick<WeekRetrievalRecord, "id" | "name">,
): WeekRetrievalRecord {
  return {
    id: values.id,
    teamId: values.teamId ?? TEAM_A,
    name: values.name,
    emoji: values.emoji ?? null,
    status: values.status ?? "upcoming",
    startDate: values.startDate ?? null,
    endDate: values.endDate ?? null,
    weekNumber: values.weekNumber ?? null,
  };
}

function weekRecipe(
  values: Partial<WeekRecipeRetrievalRecord> &
    Pick<WeekRecipeRetrievalRecord, "id" | "weekId" | "recipeId">,
): WeekRecipeRetrievalRecord {
  return {
    id: values.id,
    weekId: values.weekId,
    recipeId: values.recipeId,
    scheduledDate: values.scheduledDate ?? null,
    order: values.order ?? 0,
    made: values.made ?? false,
  };
}
