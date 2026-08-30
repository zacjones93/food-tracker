import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRunOutcome,
  createPersistenceMiddleware,
  didToolExecutionFail,
  summarizeToolInput,
  summarizeToolOutput,
} from "./persistence";
import type { AssistantRequestContext } from "./context";

function createRecordingDb(): {
  db: D1Database;
  statements: Array<{ sql: string; values: unknown[] }>;
} {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              statements.push({ sql, values });
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, statements };
}

const requestContext: AssistantRequestContext = {
  userId: "usr_1",
  teamId: "team_1",
  chatId: "chat_1",
  requestId: "req_1",
  runId: "run_1",
  maxOutputTokens: 4_000,
};

test("structured execute_typescript failures count as failed tool executions", () => {
  assert.equal(
    didToolExecutionFail({
      toolName: "execute_typescript",
      ok: true,
      result: { success: false, error: { message: "ReferenceError" } },
    }),
    true,
  );
  assert.equal(
    didToolExecutionFail({
      toolName: "execute_typescript",
      ok: true,
      result: { success: true, result: [] },
    }),
    false,
  );
});

test("all failed tool calls with no answer classify the run as error", () => {
  assert.deepEqual(
    classifyRunOutcome({
      content: "",
      failedToolCalls: 3,
      successfulToolCalls: 0,
      finishReason: "stop",
    }),
    {
      status: "error",
      errorCode: "CODE_MODE_NO_ANSWER",
      finishReason: "tool-error",
    },
  );
});

test("an answer using at least one successful tool after a failure is partial", () => {
  assert.deepEqual(
    classifyRunOutcome({
      content: "I found one of the requested recipes.",
      failedToolCalls: 1,
      successfulToolCalls: 1,
      finishReason: "stop",
    }),
    {
      status: "partial",
      errorCode: "TOOL_FAILURE_PARTIAL",
      finishReason: "partial",
    },
  );
});

test("successful answered runs preserve their provider finish reason", () => {
  assert.deepEqual(
    classifyRunOutcome({
      content: "Three chicken dinners are available.",
      failedToolCalls: 0,
      successfulToolCalls: 1,
      finishReason: "stop",
    }),
    {
      status: "completed",
      finishReason: "stop",
    },
  );
});

test("an apology after every tool failed is not treated as a usable answer", () => {
  assert.deepEqual(
    classifyRunOutcome({
      content: "Sorry, I could not retrieve those recipes.",
      failedToolCalls: 4,
      successfulToolCalls: 0,
      finishReason: "stop",
    }),
    {
      status: "error",
      errorCode: "CODE_MODE_NO_ANSWER",
      finishReason: "tool-error",
    },
  );
});

test("tool audit summaries never retain generated code or recipe bodies", () => {
  const code =
    "async () => ({ source: 'https://example.com/?mcp_token=secret' })";
  const inputSummary = summarizeToolInput({ code });
  const typescriptInputSummary = summarizeToolInput({ typescriptCode: code });
  const outputSummary = summarizeToolOutput({
    result: [{ name: "Private recipe", instructions: "Full body" }],
    logs: ["raw tool payload"],
  });
  assert.deepEqual(inputSummary, { kind: "code", codeLength: code.length });
  assert.deepEqual(typescriptInputSummary, {
    kind: "code",
    codeLength: code.length,
  });
  assert.deepEqual(outputSummary, {
    kind: "code-result",
    itemCount: 1,
    resultKind: "array",
    logCount: 1,
  });
  assert.doesNotMatch(
    JSON.stringify({ inputSummary, typescriptInputSummary, outputSummary }),
    /secret|Full body|raw tool/i,
  );
});

test("approved server tools record approval and a successful write", async () => {
  const { db, statements } = createRecordingDb();
  const middleware = createPersistenceMiddleware({
    db,
    context: requestContext,
    model: "gemini-2.5-flash",
  });
  assert.ok(middleware.onBeforeToolCall);
  assert.ok(middleware.onAfterToolCall);

  await middleware.onBeforeToolCall({} as never, {
    toolCallId: "call_1",
    args: { url: "https://example.com/recipe" },
    tool: { needsApproval: true },
  } as never);
  await middleware.onAfterToolCall({} as never, {
    toolCallId: "call_1",
    toolName: "create_recipe_from_url",
    ok: true,
    result: { success: true, recipeId: "rcp_1" },
    duration: 25,
  } as never);

  const audit = statements.find(({ sql }) =>
    sql.includes("INSERT INTO ai_tool_executions"));
  assert.ok(audit);
  assert.equal(audit.values[2], "codemode");
  assert.equal(audit.values[3], "create_recipe_from_url");
  assert.equal(audit.values[8], "approved");
  assert.equal(audit.values[9], 1);
});

test("approval interrupts close the current run instead of leaving it running", async () => {
  const { db, statements } = createRecordingDb();
  const middleware = createPersistenceMiddleware({
    db,
    context: requestContext,
    model: "gemini-2.5-flash",
  });
  assert.ok(middleware.onToolPhaseComplete);

  await middleware.onToolPhaseComplete({} as never, {
    toolCalls: [],
    results: [],
    needsApproval: [{
      toolCallId: "call_1",
      toolName: "create_recipe_from_url",
      input: {},
      approvalId: "approval_call_1",
    }],
    needsClientExecution: [],
  });

  const runUpdate = statements.find(({ sql }) => sql.includes("UPDATE ai_runs"));
  assert.ok(runUpdate);
  assert.equal(runUpdate.values[0], "interrupted");
  assert.equal(runUpdate.values[1], "approval-required");
});
