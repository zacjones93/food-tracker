import assert from "node:assert/strict";
import test from "node:test";

import {
  beginDialConnectionIntentSchema,
  dialRecipeEventSchema,
  dialRecipeProjectionSchema,
} from "./dial-contract";

const recipe = {
  id: "lst_recipe_public",
  revision: 3,
  type: "coffee_drink" as const,
  name: "Cortado",
  emoji: "☕️",
  tags: ["espresso"],
  ingredients: [{ items: ["18 g espresso", "60 g milk"] }],
  instructions: "Pull, steam, combine.",
  visibility: "public" as const,
  listoUrl: "https://listtoladle.com/integrations/dial/recipes/lst_recipe_public",
};

test("accepts a versioned idempotent coffee-drink upsert", () => {
  const event = dialRecipeEventSchema.parse({
    contract: "listo-dial",
    schemaVersion: 1,
    eventId: "lst_recipe_public:v3",
    eventType: "recipe.upsert",
    occurredAt: "2026-08-08T12:00:00.000Z",
    recipeId: recipe.id,
    revision: recipe.revision,
    audience: { scope: "global" },
    recipe,
  });
  assert.equal(event.eventId, "lst_recipe_public:v3");
});

test("requires audience and projection for upserts and reason for withdrawals", () => {
  const base = {
    contract: "listo-dial",
    schemaVersion: 1,
    eventId: "lst_recipe_public:v4",
    occurredAt: "2026-08-08T12:00:00.000Z",
    recipeId: recipe.id,
    revision: 4,
  };
  assert.equal(dialRecipeEventSchema.safeParse({ ...base, eventType: "recipe.upsert" }).success, false);
  assert.equal(dialRecipeEventSchema.safeParse({ ...base, eventType: "recipe.withdraw" }).success, false);
});

test("projection strips internal identifiers", () => {
  const projection = dialRecipeProjectionSchema.parse({
    ...recipe,
    teamId: "internal-team",
    userId: "internal-user",
    databaseId: "rcp_internal",
  });
  assert.equal("teamId" in projection, false);
  assert.equal("userId" in projection, false);
  assert.equal("databaseId" in projection, false);
});

test("connection intent requires explicit partner references and a valid return URL", () => {
  assert.equal(beginDialConnectionIntentSchema.safeParse({
    requestedScopes: ["account", "team"],
    emailHint: "person@example.com",
    returnUrl: "https://dialyourespresso.online/integrations/listo/complete",
  }).success, false);

  assert.equal(beginDialConnectionIntentSchema.safeParse({
    requestedScopes: ["account", "team"],
    dialUserRef: "dial_user_opaque",
    dialTeamRef: "dial_team_opaque",
    emailHint: "person@example.com",
    returnUrl: "https://dialyourespresso.online/integrations/listo/complete",
  }).success, true);
});
