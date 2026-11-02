/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated module/Worker test boundary. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler/package.json"))("miniflare");

// Runs actual application modules and Drizzle statements against local D1.
// The only substitutes are framework session state and RSC request memoization.
async function fixture({ rsc = false }: { rsc?: boolean } = {}) {
  const worker = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  const binding = await worker.getD1Database("DB");
  for (const file of readdirSync(resolve("src/db/migrations")).filter(file => file.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve("src/db/migrations", file), "utf8").replace(/^--.*$/gm, "").split("--> statement-breakpoint").flatMap(part => part.split(/;\s*(?:\n|$)/)).filter(part => part.trim())) {
      await binding.prepare(statement).run();
    }
  }
  const metrics = { statements: 0, rowsRead: 0, batches: 0, rowsReturned: 0 };
  function count(result: any) {
    metrics.statements++;
    metrics.rowsRead += result.meta.rows_read;
    metrics.rowsReturned += result.results?.length ?? 0;
    return result;
  }
  const d1 = {
    prepare(sql: string) {
      let prepared = binding.prepare(sql);
      const wrapper: any = {
        bind(...args: any[]) { prepared = prepared.bind(...args); return wrapper; },
        async all() { return count(await prepared.all()); },
        async raw() { const result = count(await prepared.all()); return result.results.map((row: any) => Object.values(row)); },
        async run() { return count(await prepared.run()); },
        get prepared() { return prepared; },
      };
      return wrapper;
    },
    async batch(statements: any[]) {
      metrics.batches++;
      return (await binding.batch(statements.map(statement => statement.prepared))).map(count);
    },
  };
  const db = drizzle(d1 as any, { schema });
  const modules = new Map<string, any>();
  let session: any = { user: { id: "user-a" }, activeTeamId: "team-a" };
  function load(path: string): any {
    path = resolve(path);
    if (modules.has(path)) return modules.get(path).exports;
    const loadedModule = { exports: {} as any };
    modules.set(path, loadedModule);
    const relative = path.slice(resolve("../..").length + 1);
    const source = process.env.PERF_BASE_REF && /(?:team-auth|mobile-auth|mobile-workspace|access-control|entitlements\/index)\.ts$/.test(path)
      ? execFileSync("git", ["show", `${process.env.PERF_BASE_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(path, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function scopedRequire(name: string): any {
      if (name === "server-only") return {};
      if (name === "@/db" || name === "@/db/index") return { getDB: () => db };
      if (name === "@/utils/auth") return { getSessionFromCookie: async () => session };
      if (name === "@/db/schema") return schema;
      if (name === "react") return { cache: (fn: any) => {
        const memo = new Map<string, any>();
        return (...args: any[]) => {
          if (!rsc) return fn(...args);
          const key = JSON.stringify(args);
          if (!memo.has(key)) memo.set(key, fn(...args));
          return memo.get(key);
        };
      } };
      if (name.startsWith("@/") || name.startsWith(".")) {
        let target = name.startsWith("@/") ? resolve("src", name.slice(2)) : resolve(dirname(path), name);
        if (!target.endsWith(".ts")) target += target.endsWith("entitlements") ? "/index.ts" : ".ts";
        return load(target);
      }
      return require(name);
    }
    new Function("require", "module", "exports", code)(scopedRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  await db.insert(schema.userTable).values({ id: "user-a", email: "a@example.test", passwordHash: "fixture" });
  await db.insert(schema.teamTable).values({ id: "team-a", name: "Kitchen", slug: "kitchen" });
  await db.insert(schema.teamMembershipTable).values({ teamId: "team-a", userId: "user-a", roleId: "owner" });
  function reset() { Object.assign(metrics, { statements: 0, rowsRead: 0, batches: 0, rowsReturned: 0 }); }
  reset();
  return { db, load, metrics, reset, setSession: (value: any) => { session = value; }, dispose: () => worker.dispose() };
}

async function seedPaid(db: any) {
  for (const source of ["stripe", "apple"]) {
    await db.insert(schema.teamEntitlementSnapshotsTable).values({ id: source, teamId: "team-a", source, sourceId: source, planKey: "pro", planVersion: 1, features: { weekCreationLimit: null, aiAssistant: true, pushNotifications: true } });
  }
  await db.insert(schema.teamSubscriptionsTable).values({ teamId: "team-a", stripeCustomerId: "customer", entitlementSnapshotId: "stripe", status: "active" });
  await db.insert(schema.appleSubscriptionBindingsTable).values({ teamId: "team-a", appAccountToken: "token", entitlementSnapshotId: "apple", status: "active", currentPeriodEnd: new Date("2099-01-01") });
}

test("mobile authorization preserves authentication, active membership, and custom-role decisions", async () => {
  const f = await fixture();
  try {
    const auth = f.load("src/lib/mobile-auth.ts");
    f.setSession(null);
    await assert.rejects(auth.requireMobileSession(), { status: 401, message: "Authentication required" });
    f.setSession({ user: { id: "user-a" } });
    await assert.rejects(auth.requireMobileSession(), { status: 403, message: "No active team selected" });
    f.setSession({ user: { id: "outsider" }, activeTeamId: "team-a" });
    await assert.rejects(auth.requireMobileSession(), { status: 403, message: "Active team membership is no longer valid" });
    f.setSession({ user: { id: "user-a" }, activeTeamId: "team-a" });
    await f.db.update(schema.teamMembershipTable).set({ isActive: 0 });
    await assert.rejects(auth.requireMobileSession(), { status: 403, message: "Active team membership is no longer valid" });
    await f.db.insert(schema.teamRoleTable).values({ id: "custom", teamId: "team-a", name: "Custom", permissions: ["access_recipes"] });
    await f.db.update(schema.teamMembershipTable).set({ isActive: 1, isSystemRole: 0, roleId: "custom" });
    assert.deepEqual((await auth.requireMobileSession()).permissions, ["access_recipes"]);
    await f.db.delete(schema.teamRoleTable);
    assert.deepEqual((await auth.requireMobileSession()).permissions, []);
    const teamAuth = f.load("src/utils/team-auth.ts");
    await assert.rejects(teamAuth.requirePermission("outsider", "team-a", "edit_recipes"), { message: "FORBIDDEN: Missing permission edit_recipes" });
    const { TEAM_PERMISSIONS: permissions, SYSTEM_ROLES_ENUM: roles } = schema;
    assert.equal(teamAuth.getSystemRolePermissions(roles.OWNER).includes(permissions.DELETE_TEAM), true);
    assert.equal(teamAuth.getSystemRolePermissions(roles.ADMIN).includes(permissions.DELETE_TEAM), false);
    assert.equal(teamAuth.getSystemRolePermissions(roles.MEMBER).includes(permissions.DELETE_RECIPES), false);
    assert.equal(teamAuth.getSystemRolePermissions(roles.GUEST).includes(permissions.CREATE_RECIPES), false);
    assert.deepEqual(teamAuth.getSystemRolePermissions("unknown"), []);
    (f.db.query.teamTable as any).findFirst = async () => undefined;
    await assert.rejects(auth.requireMobileSession(), { status: 403, message: "Active team no longer exists" });
  } finally { await f.dispose(); }
});

test("AI access preserves denial precedence and Apple/Stripe fallback", async () => {
  const f = await fixture();
  try {
    const access = f.load("src/lib/ai/access-control.ts");
    assert.deepEqual(await access.checkAiAccess({ teamId: "missing", userId: "outsider" }), { allowed: false, reason: "Team not found" });
    assert.deepEqual(await access.checkAiAccess({ teamId: "team-a", userId: "outsider" }), { allowed: false, reason: "You are not an active member of this team" });
    assert.deepEqual(await access.checkAiAccess({ teamId: "team-a", userId: "user-a" }), { allowed: false, reason: "The AI assistant requires a List To Ladle Pro subscription" });
    await seedPaid(f.db);
    const entitlements = f.load("src/lib/entitlements/index.ts");
    assert.equal((await entitlements.getTeamEntitlements({ teamId: "team-a" })).source, "apple");
    await f.db.update(schema.appleSubscriptionBindingsTable).set({ status: "expired" });
    assert.equal((await entitlements.getTeamEntitlements({ teamId: "team-a" })).source, "stripe");
    assert.deepEqual(await access.checkAiAccess({ teamId: "team-a", userId: "user-a" }), { allowed: false, reason: "AI policy has not been configured for this team." });
    await f.db.insert(schema.teamSettingsTable).values({ teamId: "team-a", aiEnabled: false });
    assert.deepEqual(await access.checkAiAccess({ teamId: "team-a", userId: "user-a" }), { allowed: false, reason: "AI features are disabled for this team." });
    await f.db.update(schema.teamSettingsTable).set({ aiEnabled: true });
    assert.equal((await access.checkAiAccess({ teamId: "team-a", userId: "user-a" })).allowed, true);
  } finally { await f.dispose(); }
});

test("layout + AI page deduplicates access reads within one RSC request", async () => {
  const f = await fixture({ rsc: true });
  try {
    await seedPaid(f.db);
    await f.db.insert(schema.teamSettingsTable).values({ teamId: "team-a", aiEnabled: true });
    const access = f.load("src/lib/ai/access-control.ts");
    f.reset();
    const results = await Promise.all([access.checkAiAccess({ teamId: "team-a", userId: "user-a" }), access.checkAiAccess({ teamId: "team-a", userId: "user-a" })]);
    assert.equal(results[0].allowed, true);
    assert.deepEqual(results[0], results[1]);
    console.log("PERF page auth", f.metrics);
    if (!process.env.PERF_BASE_REF) { assert.equal(f.metrics.statements, 5); assert.equal(f.metrics.rowsRead, 7); }
  } finally { await f.dispose(); }
});

test("mobile workspace preserves all history and wire size within its statement budget", async () => {
  const f = await fixture();
  try {
    await f.db.insert(schema.recipesTable).values({ id: "recipe-a", teamId: "team-a", name: "Soup", ingredients: [{ items: ["Water"] }] });
    for (let i = 0; i < 20; i++) {
      await f.db.insert(schema.weeksTable).values({ id: `week-${i}`, teamId: "team-a", name: `Week ${i}`, status: "archived", createdAt: new Date("2020-01-01"), startDate: new Date("2020-01-01") });
      await f.db.insert(schema.weekRecipesTable).values({ weekId: `week-${i}`, recipeId: "recipe-a" });
      for (let j = 0; j < 50; j += 10) await f.db.insert(schema.groceryItemsTable).values(Array.from({ length: 10 }, (_, k) => ({ weekId: `week-${i}`, name: `Item ${j + k}`, category: "Produce" })));
    }
    const auth = f.load("src/lib/mobile-auth.ts");
    const workspace = f.load("src/lib/mobile-workspace.ts");
    f.reset();
    const context = await auth.requireMobileSession();
    const payload = await workspace.getMobileWorkspace(context);
    assert.equal(payload.groceryItems.length, 1000);
    assert.equal(payload.weekRecipes.length, 20);
    assert.equal(payload.weeks.length, 20);
    assert.deepEqual(Object.keys(payload.groceryItems[0]).sort(), ["category", "checked", "clientId", "createdAt", "id", "name", "order", "updatedAt", "weekId"]);
    console.log("PERF workspace endpoint", { ...f.metrics, bytes: Buffer.byteLength(JSON.stringify(payload)) });
    if (!process.env.PERF_BASE_REF) { assert.equal(f.metrics.statements, 13); assert.equal(f.metrics.rowsRead, 2169); }
    f.reset();
    const denied = await workspace.getMobileWorkspace({ teamId: "team-a", permissions: [] });
    assert.deepEqual(denied.groceryItems, []);
    assert.deepEqual(denied.recipes, []);
    assert.deepEqual(denied.versions, []);
  } finally { await f.dispose(); }
});
