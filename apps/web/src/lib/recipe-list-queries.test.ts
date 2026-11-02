import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getRecipeScheduleStats, recipeListColumns } from "./recipe-list-queries";

test("schedule summaries count distinct team weeks and choose the latest matching week", async () => {
  const proxy = await getPlatformProxy<CloudflareEnv>({ persist: false });
  try {
    const binding = proxy.env.NEXT_TAG_CACHE_D1;
    assert.ok(binding);
    await binding.exec("CREATE TABLE weeks (id TEXT PRIMARY KEY, name TEXT, teamId TEXT, startDate INTEGER); CREATE TABLE week_recipes (id TEXT PRIMARY KEY, recipeId TEXT, weekId TEXT);");
    await binding.exec("INSERT INTO weeks VALUES ('old', 'Old week', 'a', 1), ('new', 'New week', 'a', 2), ('foreign', 'Foreign week', 'b', 3), ('null-date', 'No date', 'a', NULL); INSERT INTO week_recipes VALUES ('1','r','old'), ('2','r','new'), ('3','r','new'), ('4','r','foreign'), ('5','null','null-date');");
    let statements = 0;
    const db = drizzle(binding, { schema, logger: { logQuery() { statements++; } } });
    const stats = await getRecipeScheduleStats({ db, teamId: "a", recipeIds: ["r", "null", ...Array.from({ length: 150 }, (_, index) => `missing-${index}`)] });
    assert.equal(statements, 1);
    assert.deepEqual(stats.get("r"), { weekCount: 2, latestWeekId: "new", latestWeekName: "New week" });
    assert.deepEqual(stats.get("null"), { weekCount: 1, latestWeekId: "null-date", latestWeekName: "No date" });
    assert.equal(stats.has("missing-1"), false);
    await getRecipeScheduleStats({ db, teamId: "a", recipeIds: [] });
    assert.equal(statements, 1, "empty pages must not issue a query");
    assert.equal("recipeBody" in recipeListColumns, false);
    assert.equal("ingredients" in recipeListColumns, false);
  } finally {
    await proxy.dispose();
  }
});
