import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRunOutcome,
  summarizeToolInput,
  summarizeToolOutput,
} from "./persistence";

test("all failed tool calls with no answer classify the run as error", () => {
  assert.deepEqual(classifyRunOutcome({
    content: "",
    failedToolCalls: 3,
    successfulToolCalls: 0,
    finishReason: "stop",
  }), {
    status: "error",
    errorCode: "CODE_MODE_NO_ANSWER",
    finishReason: "tool-error",
  });
});

test("an answer using at least one successful tool after a failure is partial", () => {
  assert.deepEqual(classifyRunOutcome({
    content: "I found one of the requested recipes.",
    failedToolCalls: 1,
    successfulToolCalls: 1,
    finishReason: "stop",
  }), {
    status: "partial",
    errorCode: "TOOL_FAILURE_PARTIAL",
    finishReason: "partial",
  });
});

test("successful answered runs preserve their provider finish reason", () => {
  assert.deepEqual(classifyRunOutcome({
    content: "Three chicken dinners are available.",
    failedToolCalls: 0,
    successfulToolCalls: 1,
    finishReason: "stop",
  }), {
    status: "completed",
    finishReason: "stop",
  });
});

test("an apology after every tool failed is not treated as a usable answer", () => {
  assert.deepEqual(classifyRunOutcome({
    content: "Sorry, I could not retrieve those recipes.",
    failedToolCalls: 4,
    successfulToolCalls: 0,
    finishReason: "stop",
  }), {
    status: "error",
    errorCode: "CODE_MODE_NO_ANSWER",
    finishReason: "tool-error",
  });
});

test("tool audit summaries never retain generated code or recipe bodies", () => {
  const code = "async () => ({ source: 'https://example.com/?mcp_token=secret' })";
  const inputSummary = summarizeToolInput({ code });
  const outputSummary = summarizeToolOutput({
    result: [{ name: "Private recipe", instructions: "Full body" }],
    logs: ["raw tool payload"],
  });
  assert.deepEqual(inputSummary, { kind: "code", codeLength: code.length });
  assert.deepEqual(outputSummary, {
    kind: "code-result",
    itemCount: 1,
    resultKind: "array",
    logCount: 1,
  });
  assert.doesNotMatch(JSON.stringify({ inputSummary, outputSummary }), /secret|Full body|raw tool/i);
});
