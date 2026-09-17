import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import ts from "typescript";
import * as schema from "../db/schema";
import * as templateSchemas from "../schemas/grocery-template.schema";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const actionSource = ts.transpileModule(
  readFileSync(new URL("../app/(dashboard)/schedule/grocery-templates.actions.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Run the real action and Drizzle-generated SQL, replacing only the request
// context and D1 transport. SQLite alone does not enforce D1's 100-bind limit.
function createHarness({ itemCount }: { itemCount: number }) {
  const sqlite = new Database(":memory:");
  sqlite.exec(`CREATE TABLE grocery_items (
    id TEXT PRIMARY KEY, clientId TEXT, weekId TEXT NOT NULL, name TEXT NOT NULL,
    checked INTEGER NOT NULL, "order" INTEGER, category TEXT,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
  )`);
  const parameterCounts: number[] = [];
  const database = drizzle(async (query, params) => {
    parameterCounts.push(params.length);
    assert.ok(params.length <= 100, `D1 query has ${params.length} bound parameters (maximum 100)`);
    sqlite.prepare(query).run(...params);
    return { rows: [] };
  });
  const template = [
    { category: "Produce", order: 0, items: Array.from({ length: itemCount }, (_, order) => ({ name: `Item ${order}`, order })) },
    { category: "Dairy", order: 1, items: [] },
  ];
  const invalidated: string[] = [];
  const databaseWithQueries = {
    insert: database.insert.bind(database),
    query: {
      weeksTable: { findFirst: async () => ({ id: "week-new", teamId: "team-1" }) },
      groceryListTemplatesTable: { findFirst: async () => ({ template }) },
    },
  };
  const actionExports: Record<string, (input: unknown) => Promise<{ itemCount: number }>> = {};
  runInNewContext(actionSource, {
    exports: actionExports,
    require: (id: string) => {
      if (id === "@/db") return { getDB: () => databaseWithQueries };
      if (id === "@/db/schema") return schema;
      if (id === "@/schemas/grocery-template.schema") return templateSchemas;
      if (id === "@/utils/auth") return { getSessionFromCookie: async () => ({ user: { id: "user-1" } }) };
      if (id === "@/utils/team-auth") return { requirePermission: async () => {} };
      if (id === "next/cache") return { revalidatePath: (path: string) => invalidated.push(path) };
      if (id === "zsa") return {
        createServerAction: () => ({
          input: (inputSchema: { parse: (input: unknown) => unknown }) => ({
            handler: (handler: (args: { input: unknown }) => unknown) =>
              (input: unknown) => handler({ input: inputSchema.parse(input) }),
          }),
          handler: (handler: unknown) => handler,
        }),
      };
      return require(id);
    },
  });
  return { sqlite, parameterCounts, invalidated, apply: actionExports.applyTemplateToWeekAction };
}

for (const itemCount of [0, 1, 12, 13, 75]) {
  test(`applying a ${itemCount}-item template copies every item within D1 limits`, async () => {
    const { sqlite, parameterCounts, invalidated, apply } = createHarness({ itemCount });
    try {
      const result = await apply({ weekId: "week-new", templateId: "template-new" });
      assert.equal(result.itemCount, itemCount);
      const rows = sqlite.prepare('SELECT * FROM grocery_items ORDER BY "order"').all() as Record<string, unknown>[];
      assert.equal(rows.length, itemCount);
      rows.forEach((row, index) => {
        assert.equal(row.weekId, "week-new");
        assert.equal(row.name, `Item ${index}`);
        assert.equal(row.category, "Produce");
        assert.equal(row.order, index);
        assert.equal(row.checked, 0);
        assert.match(String(row.id), /^gi_/);
      });
      assert.ok(parameterCounts.every((count) => count <= 100));
      assert.deepEqual(invalidated, ["/schedule/week-new"]);
    } finally {
      sqlite.close();
    }
  });
}
