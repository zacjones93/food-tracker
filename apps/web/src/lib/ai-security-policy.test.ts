import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

interface NodeModuleLoader {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
}

const require = createRequire(import.meta.url);
const moduleLoader = require("node:module") as NodeModuleLoader;
const originalLoad = moduleLoader._load;

// Next.js treats this as a compile-time server boundary. The focused Node tests
// stub only that marker so the pure policy functions can execute in isolation.
moduleLoader._load = function loadModule(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

async function loadPolicyModules() {
  try {
    const [permissionsImport, accessControlImport] = await Promise.all([
      import("./ai/permissions"),
      import("./ai/access-control"),
    ]);

    return {
      permissions:
        (permissionsImport as unknown as { default?: typeof permissionsImport }).default ??
        permissionsImport,
      accessControl:
        (accessControlImport as unknown as { default?: typeof accessControlImport }).default ??
        accessControlImport,
    };
  } finally {
    moduleLoader._load = originalLoad;
  }
}

const policyModules = loadPolicyModules();

test("chat ownership requires the same user and active team", async () => {
  const { permissions } = await policyModules;
  const chat = { userId: "user-1", teamId: "team-1" };

  assert.equal(
    permissions.isChatOwnedBy({ chat, userId: "user-1", teamId: "team-1" }),
    true,
  );
  assert.equal(
    permissions.isChatOwnedBy({ chat, userId: "user-1", teamId: "team-2" }),
    false,
    "the same user cannot access a chat through a different active team",
  );
  assert.equal(
    permissions.isChatOwnedBy({ chat, userId: "user-2", teamId: "team-1" }),
    false,
    "another team member cannot access a private chat",
  );
  assert.equal(
    permissions.isChatOwnedBy({ chat, userId: "user-2", teamId: "team-2" }),
    false,
    "cross-user and cross-team access is denied",
  );
});

test("monthly budget policy denies zero, exhausted, and exceeded budgets", async () => {
  const { accessControl } = await policyModules;
  assert.equal(
    accessControl.isWithinMonthlyBudget({ currentCostUsd: 4.99, monthlyBudgetUsd: 5 }),
    true,
  );
  assert.equal(
    accessControl.isWithinMonthlyBudget({ currentCostUsd: 5, monthlyBudgetUsd: 5 }),
    false,
  );
  assert.equal(
    accessControl.isWithinMonthlyBudget({ currentCostUsd: 6, monthlyBudgetUsd: 5 }),
    false,
  );
  assert.equal(
    accessControl.isWithinMonthlyBudget({ currentCostUsd: 0, monthlyBudgetUsd: 0 }),
    false,
  );
});

test("typed AI errors retain supported HTTP classifications", async () => {
  const { permissions } = await policyModules;
  for (const status of [401, 403, 409, 422, 429, 500] as const) {
    const error = permissions.createAiRequestError({
      code: `STATUS_${status}`,
      message: "classified",
      status,
    });

    assert.equal(permissions.isAiRequestError(error), true);
    assert.equal(error.status, status);
  }
});

test("the error boundary redacts unrelated failures and returns correlation IDs", async () => {
  const { permissions } = await policyModules;
  const response = permissions.aiErrorResponse({
    error: new Error("database credentials leaked here"),
    requestId: "request-1",
    runId: "run-1",
  });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-request-id"), "request-1");
  assert.equal(response.headers.get("x-run-id"), "run-1");
  assert.equal(body.error, "Internal server error");
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.requestId, "request-1");
  assert.equal(body.runId, "run-1");
});

test("the legacy model call applies the configured output-token ceiling", () => {
  const routeSource = readFileSync(
    new URL("../app/api/chat/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(routeSource, /maxOutputTokens:\s*settings\.maxTokensPerRequest/);
});
