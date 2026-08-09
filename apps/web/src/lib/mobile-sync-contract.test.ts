import assert from "node:assert/strict";
import test from "node:test";

import {
  mobileChangesQuerySchema,
  mobileMutationSchema,
  mobileSyncRequestSchema,
  recipeRelationPayloadSchema,
  recipePayloadSchema,
  weekRecipePayloadSchema,
} from "./mobile-sync-contract";

test("normalizes the compact native mutation aliases", () => {
  const mutation = mobileMutationSchema.parse({
    id: "mutation-1",
    entity: "recipe",
    entityId: "local-recipe-1",
    operation: "create",
    clientUpdatedAt: "2026-07-15T12:00:00.000Z",
    payload: { name: "Tomato soup", tags: ["dinner"] },
  });

  assert.equal(mutation.mutationId, "mutation-1");
  assert.equal(mutation.entityType, "recipe");
  assert.equal(mutation.clientEntityId, "local-recipe-1");
  assert.deepEqual(mutation.changedFields, ["name", "tags"]);
  assert.equal(mutation.baseUpdatedAt?.toISOString(), "2026-07-15T12:00:00.000Z");
});

test("requires stable client IDs for offline creates", () => {
  const result = mobileMutationSchema.safeParse({
    mutationId: "mutation-2",
    entityType: "groceryItem",
    operation: "create",
    payload: { weekId: "wk_1", name: "Milk" },
  });

  assert.equal(result.success, false);
});

test("requires canonical server IDs for update and delete", () => {
  const result = mobileMutationSchema.safeParse({
    mutationId: "mutation-3",
    entityType: "week",
    operation: "update",
    payload: { name: "Next week" },
  });

  assert.equal(result.success, false);
});

test("treats a local entity ID as the lookup key for later updates", () => {
  const mutation = mobileMutationSchema.parse({
    mutationId: "mutation-4",
    entityType: "recipe",
    operation: "update",
    entityId: "local-recipe-1",
    payload: { name: "Updated soup" },
  });

  assert.equal(mutation.serverEntityId, "local-recipe-1");
});

test("deletes conflict with any newer server change", () => {
  const mutation = mobileMutationSchema.parse({
    mutationId: "mutation-5",
    entityType: "groceryItem",
    operation: "delete",
    entityId: "gi_1",
  });

  assert.deepEqual(mutation.changedFields, ["*"]);
});

test("rejects unknown recipe fields instead of forwarding them to D1", () => {
  const result = recipePayloadSchema.safeParse({
    name: "Soup",
    teamId: "attacker-controlled-team",
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal("teamId" in result.data, false);
});

test("accepts recipe provenance for remixes", () => {
  const recipe = recipePayloadSchema.parse({
    name: "Tomato soup remix",
    sourceRecipeId: "recipe-original",
  });

  assert.equal(recipe.sourceRecipeId, "recipe-original");
});

test("accepts the dedicated coffee drink recipe type", () => {
  const recipe = recipePayloadSchema.parse({
    name: "Cortado",
    recipeType: "coffee_drink",
    visibility: "unlisted",
  });

  assert.equal(recipe.recipeType, "coffee_drink");
  assert.equal(recipe.visibility, "unlisted");
});

test("caps mutation batches and change pages", () => {
  const mutation = {
    mutationId: "mutation",
    entityType: "recipe" as const,
    clientEntityId: "client-recipe",
    operation: "create" as const,
    payload: { name: "Soup" },
  };

  assert.equal(
    mobileSyncRequestSchema.safeParse({
      mutations: Array.from({ length: 501 }, (_, index) => ({
        ...mutation,
        mutationId: `mutation-${index}`,
      })),
    }).success,
    false,
  );
  assert.equal(mobileChangesQuerySchema.safeParse({ cursor: 0, limit: 501 }).success, false);
});

test("accepts preparation suggestions and linked schedule occurrences", () => {
  const relation = recipeRelationPayloadSchema.parse({
    mainRecipeId: "recipe-pizza",
    sideRecipeId: "recipe-dough",
    relationType: "base",
    scheduleLeadDays: 1,
  });
  const occurrence = weekRecipePayloadSchema.parse({
    weekId: "week-1",
    recipeId: "recipe-dough",
    scheduledForWeekRecipeId: "week-recipe-pizza",
    sourceRecipeRelationId: "relation-dough",
  });

  assert.equal(relation.scheduleLeadDays, 1);
  assert.equal(occurrence.scheduledForWeekRecipeId, "week-recipe-pizza");
  assert.equal(occurrence.sourceRecipeRelationId, "relation-dough");
});
