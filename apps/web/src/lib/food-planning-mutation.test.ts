import assert from "node:assert/strict";
import test from "node:test";

import {
  FOOD_PLANNING_MUTATION_PERMISSIONS,
  getFoodPlanningReferences,
  orderFoodPlanningMutations,
  parseFoodPlanningMutationData,
} from "./food-planning/mutation";

test("recipe names keep the canonical two-character minimum", () => {
  assert.throws(
    () => parseFoodPlanningMutationData({
      entity: "recipe",
      operation: "create",
      data: { name: "A" },
    }),
    /at least 2 character/u,
  );

  assert.deepEqual(
    parseFoodPlanningMutationData({
      entity: "recipe",
      operation: "create",
      data: { name: "AI" },
    }),
    { name: "AI" },
  );
});

test("recipe relations retain scheduling metadata and reject unknown relation types", () => {
  assert.deepEqual(
    parseFoodPlanningMutationData({
      entity: "recipeRelation",
      operation: "create",
      data: {
        mainRecipeId: "rcp_main",
        sideRecipeId: "rcp_side",
        relationType: "side",
        scheduleLeadDays: 2,
      },
    }),
    {
      mainRecipeId: "rcp_main",
      sideRecipeId: "rcp_side",
      relationType: "side",
      scheduleLeadDays: 2,
    },
  );

  assert.throws(
    () => parseFoodPlanningMutationData({
      entity: "recipeRelation",
      operation: "create",
      data: {
        mainRecipeId: "rcp_main",
        sideRecipeId: "rcp_side",
        relationType: "arbitrary",
      },
    }),
    /Invalid enum value/u,
  );
});

test("scheduled preparations expose every ownership reference", () => {
  const data = parseFoodPlanningMutationData({
    entity: "weekRecipe",
    operation: "create",
    data: {
      weekId: "wk_1",
      recipeId: "rcp_1",
      scheduledForWeekRecipeId: "wr_parent",
      sourceRecipeRelationId: "rr_1",
    },
  });

  assert.deepEqual(getFoodPlanningReferences({ entity: "weekRecipe", data }), [
    { field: "weekId", entity: "week", id: "wk_1", access: "owned" },
    { field: "recipeId", entity: "recipe", id: "rcp_1", access: "owned" },
    {
      field: "scheduledForWeekRecipeId",
      entity: "weekRecipe",
      id: "wr_parent",
      access: "owned",
    },
    {
      field: "sourceRecipeRelationId",
      entity: "recipeRelation",
      id: "rr_1",
      access: "owned",
    },
  ]);
});

test("mutation dependency order and permission rules are transport-independent", () => {
  const ordered = orderFoodPlanningMutations([
    { entity: "groceryItem", operation: "create" },
    { entity: "weekRecipe", operation: "create" },
    { entity: "recipe", operation: "create" },
    { entity: "recipeBook", operation: "create" },
    { entity: "week", operation: "create" },
  ]);

  assert.deepEqual(ordered.map(({ entity }) => entity), [
    "recipeBook",
    "recipe",
    "week",
    "weekRecipe",
    "groceryItem",
  ]);
  assert.equal(
    FOOD_PLANNING_MUTATION_PERMISSIONS.week.create,
    "create_schedules",
  );
  assert.equal(
    FOOD_PLANNING_MUTATION_PERMISSIONS.recipeRelation.delete,
    "edit_recipes",
  );
});

test("mixed mutations create dependencies before deleting dependents", () => {
  const ordered = orderFoodPlanningMutations([
    { entity: "recipe", operation: "delete" },
    { entity: "groceryItem", operation: "create" },
    { entity: "recipeBook", operation: "delete" },
    { entity: "week", operation: "create" },
    { entity: "weekRecipe", operation: "delete" },
  ]);

  assert.deepEqual(ordered, [
    { entity: "week", operation: "create" },
    { entity: "groceryItem", operation: "create" },
    { entity: "weekRecipe", operation: "delete" },
    { entity: "recipe", operation: "delete" },
    { entity: "recipeBook", operation: "delete" },
  ]);
});
