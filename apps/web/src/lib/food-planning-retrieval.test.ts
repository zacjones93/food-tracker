import assert from "node:assert/strict";
import test from "node:test";

import {
  createFoodPlanningRetrieval,
  normalizeFoodPlanningRecord,
  type FoodPlanningQueryPort,
} from "./ai/retrieval/food-planning";

test("normalizes JSON, booleans, and epoch dates at the retrieval boundary", () => {
  assert.deepEqual(normalizeFoodPlanningRecord({
    tags: '["quick","dinner"]',
    ingredients: '[{"items":["rice"]}]',
    checked: 1,
    made: 0,
    scheduledDate: 1_735_689_600,
  }), {
    tags: ["quick", "dinner"],
    ingredients: [{ items: ["rice"] }],
    checked: true,
    made: false,
    scheduledDate: "2025-01-01T00:00:00.000Z",
  });
});

test("recipe-book retrieval scopes visibility before filtering, ordering, and limit", async () => {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const query: FoodPlanningQueryPort = {
    async all({ sql, bindings }) {
      calls.push({ sql, bindings });
      return [{
        id: "rb_team",
        name: "Family",
        teamId: "team_a",
        ownershipScope: "team",
        createdAt: 1_735_689_600,
      }];
    },
    async first() {
      return null;
    },
  };
  const retrieval = createFoodPlanningRetrieval({ query, teamId: "team_a" });

  const result = await retrieval.recipeBooks.search({
    text: "fam",
    ids: ["rb_team"],
    limit: 5,
  });

  assert.equal(result.count, 1);
  assert.equal(result.items[0]?.createdAt, "2025-01-01T00:00:00.000Z");
  assert.match(calls[0]?.sql ?? "", /WHERE \(teamId = \? OR teamId IS NULL\)[\s\S]*lower\(name\) LIKE \?[\s\S]*id IN \(\?\)[\s\S]*ORDER BY lower\(name\), id[\s\S]*LIMIT \?/u);
  assert.deepEqual(calls[0]?.bindings, ["team_a", "team_a", "%fam%", "rb_team", 5]);
});

test("week-recipe retrieval returns preparation linkage using active-team joins", async () => {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const query: FoodPlanningQueryPort = {
    async all({ sql, bindings }) {
      calls.push({ sql, bindings });
      return [{
        id: "wr_child",
        weekId: "wk_1",
        recipeId: "rcp_side",
        scheduledForWeekRecipeId: "wr_main",
        sourceRecipeRelationId: "rr_side",
        made: 0,
      }];
    },
    async first() {
      return null;
    },
  };
  const retrieval = createFoodPlanningRetrieval({ query, teamId: "team_a" });

  const result = await retrieval.weekRecipes.search({
    weekIds: ["wk_1"],
    limit: 20,
  });

  assert.deepEqual(result.items[0], {
    id: "wr_child",
    weekId: "wk_1",
    recipeId: "rcp_side",
    scheduledForWeekRecipeId: "wr_main",
    sourceRecipeRelationId: "rr_side",
    made: false,
  });
  assert.match(calls[0]?.sql ?? "", /JOIN weeks w ON w.id = wr.weekId[\s\S]*w.teamId = \?/u);
  assert.match(calls[0]?.sql ?? "", /scheduledForWeekRecipeId/u);
  assert.deepEqual(calls[0]?.bindings, ["team_a", "wk_1", 20]);
});

test("food-planning settings keep existing defaults when no row exists", async () => {
  const query: FoodPlanningQueryPort = {
    async all() {
      return [];
    },
    async first() {
      return null;
    },
  };
  const retrieval = createFoodPlanningRetrieval({ query, teamId: "team_a" });

  assert.deepEqual(await retrieval.settings.get(), {
    recipeVisibilityMode: "all",
    defaultRecipeVisibility: "public",
    autoAddIngredientsToGrocery: true,
  });
});

test("global grocery templates must be both unowned and explicitly default", async () => {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const query: FoodPlanningQueryPort = {
    async all({ sql, bindings }) {
      calls.push({ sql, bindings });
      return [];
    },
    async first() {
      return null;
    },
  };
  const retrieval = createFoodPlanningRetrieval({ query, teamId: "team_a" });

  await retrieval.groceryTemplates.search({ includeItems: false, limit: 10 });

  assert.match(
    calls[0]?.sql ?? "",
    /teamId = \? OR \(teamId IS NULL AND isDefault = 1\)/u,
  );
  assert.deepEqual(calls[0]?.bindings, ["team_a", 10]);
});
