import assert from "node:assert/strict";
import test from "node:test";
import { recipeShareUrl, shareRecipeLink } from "./recipe-sharing";
import { canViewRecipeByLink } from "./recipe-access";

test("recipe links use the app detail URL without edit flags or source URLs", () => {
  assert.equal(recipeShareUrl({ origin: "https://listtoladle.com/recipes/other?edit=dial", recipeId: "recipe-123" }),
    "https://listtoladle.com/recipes/recipe-123");
});

test("native sharing includes the recipe title and direct URL", async () => {
  let shared: ShareData | undefined;
  const result = await shareRecipeLink({
    browser: { share: async (data) => { shared = data; } },
    title: "Soup", url: "https://listtoladle.com/recipes/soup",
  });
  assert.equal(result, "shared");
  assert.deepEqual(shared, { title: "Soup", url: "https://listtoladle.com/recipes/soup" });
});

test("desktop browsers copy the recipe URL", async () => {
  let copied = "";
  assert.equal(await shareRecipeLink({
    browser: { clipboard: { writeText: async (text) => { copied = text; } } },
    title: "Soup", url: "https://listtoladle.com/recipes/soup",
  }), "copied");
  assert.equal(copied, "https://listtoladle.com/recipes/soup");
});

test("cancelling the share sheet does not copy or show a fallback", async () => {
  assert.equal(await shareRecipeLink({
    browser: {
      share: async () => { throw new DOMException("Cancelled", "AbortError"); },
      clipboard: { writeText: async () => { assert.fail("Unexpected clipboard write"); } },
    },
    title: "Soup", url: "https://listtoladle.com/recipes/soup",
  }), "cancelled");
});

test("failed native sharing falls back to the clipboard", async () => {
  assert.equal(await shareRecipeLink({
    browser: {
      share: async () => { throw new DOMException("Denied", "NotAllowedError"); },
      clipboard: { writeText: async () => {} },
    },
    title: "Soup", url: "https://listtoladle.com/recipes/soup",
  }), "copied");
});

test("unavailable or denied clipboard access offers manual copying", async () => {
  for (const browser of [{}, { clipboard: { writeText: async () => { throw new Error("Denied"); } } }]) {
    assert.equal(await shareRecipeLink({ browser, title: "Soup", url: "https://listtoladle.com/recipes/soup" }), "manual");
  }
});

test("guest related recipes include public and unlisted recipes, never private recipes", () => {
  for (const visibility of ["public", "unlisted", "private"]) {
    assert.equal(canViewRecipeByLink({ recipe: { teamId: "owner", visibility } }), visibility !== "private");
  }
});

test("private related recipes are visible only to their active team", () => {
  const recipe = { teamId: "owner", visibility: "private" };
  assert.equal(canViewRecipeByLink({ recipe, activeTeamId: "owner" }), true);
  assert.equal(canViewRecipeByLink({ recipe, activeTeamId: "other" }), false);
});
