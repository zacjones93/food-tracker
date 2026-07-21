import assert from "node:assert/strict";
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
  const { accessControl } = await policyModules;
  const chat = { userId: "user-1", teamId: "team-1" };

  assert.equal(
    accessControl.isChatOwnedBy({ chat, userId: "user-1", teamId: "team-1" }),
    true,
  );
  assert.equal(
    accessControl.isChatOwnedBy({ chat, userId: "user-1", teamId: "team-2" }),
    false,
    "the same user cannot access a chat through a different active team",
  );
  assert.equal(
    accessControl.isChatOwnedBy({ chat, userId: "user-2", teamId: "team-1" }),
    false,
    "another team member cannot access a private chat",
  );
  assert.equal(
    accessControl.isChatOwnedBy({ chat, userId: "user-2", teamId: "team-2" }),
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
    const error = permissions.createAiDomainError({
      code: `STATUS_${status}`,
      message: "classified",
      status,
    });

    assert.equal(permissions.isAiDomainError(error), true);
    assert.equal(error.status, status);
  }
});

test("the error boundary redacts unrelated failures and returns correlation IDs", async () => {
  const { permissions } = await policyModules;
  const context = permissions.withAiChatContext({
    context: permissions.authorizeAiRequestContext({
      context: permissions.createAiRequestContext({ requestId: "request-1" }),
      userId: "user-1",
      teamId: "team-1",
    }),
    chatId: "chat-1",
  });
  const response = permissions.aiErrorResponse({
    error: new Error("database credentials leaked here"),
    context,
  });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-request-id"), "request-1");
  assert.equal(response.headers.get("x-run-id"), context.runId);
  assert.equal(body.error, "Internal server error");
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.requestId, "request-1");
  assert.equal(body.runId, context.runId);
  assert.equal(context.userId, "user-1");
  assert.equal(context.teamId, "team-1");
  assert.equal(context.chatId, "chat-1");
});

test("the runtime token policy returns a strict provider output ceiling", async () => {
  const { accessControl } = await policyModules;
  assert.equal(
    accessControl.resolveMaxOutputTokens({ maxTokensPerRequest: 4000.9 }),
    4000,
  );
  assert.equal(
    accessControl.resolveMaxOutputTokens({ maxTokensPerRequest: 0 }),
    null,
  );
  assert.equal(
    accessControl.resolveMaxOutputTokens({ maxTokensPerRequest: Number.NaN }),
    null,
  );
});
