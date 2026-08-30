import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMiddlewareContext, StreamChunk } from "@tanstack/ai";
import { EventType } from "@tanstack/ai/client";

import {
  createAssistantTextGuardMiddleware,
  sanitizeAssistantText,
} from "./assistant-text";

test("removes serialized Code Mode tool calls from user-facing text", () => {
  const response = `Here are the ingredients you requested:\n\n{"name":"codemode_execute","parameters":{"code":"async () => { return await recipes.search({}); }"}}`;

  assert.equal(
    sanitizeAssistantText(response),
    "Here are the ingredients you requested:",
  );
});

test("removes serialized TanStack execute_typescript calls from user-facing text", () => {
  const response = `I found three dinner ideas.\n\n{"name":"execute_typescript","arguments":{"typescriptCode":"return await external_recipeSearch({ text: \\"chicken\\" });"}}`;

  assert.equal(sanitizeAssistantText(response), "I found three dinner ideas.");
});

test("removes fenced generated code while preserving surrounding prose", () => {
  const response = `I found three dinner ideas.\n\n\`\`\`javascript\nasync () => {\n  return recipes.search({ mealTypes: ["Dinner"] });\n}\n\`\`\`\n\nThey are all saved in your recipe collection.`;

  assert.equal(
    sanitizeAssistantText(response),
    "I found three dinner ideas.\n\nThey are all saved in your recipe collection.",
  );
});

test("truncates incomplete generated code so partial streams cannot leak it", () => {
  const response =
    "I found the current week.\n\nasync () => { const result = await weeks.search(";

  assert.equal(sanitizeAssistantText(response), "I found the current week.");
});

test("leaves ordinary assistant prose unchanged", () => {
  const response = "I found three chicken dinners: curry, fajitas, and wings.";

  assert.equal(sanitizeAssistantText(response), response);
});

test("buffers streamed text and emits only the sanitized response", async () => {
  const middleware = createAssistantTextGuardMiddleware();
  const onChunk = middleware.onChunk;
  assert.ok(onChunk);
  const context = {} as ChatMiddlewareContext;
  const messageId = "assistant-message";
  const leakedResponse = `I found the current week.\n\n{"name":"codemode_execute","parameters":{"code":"async () => weeks.search({})"}}`;

  const startOutput = await onChunk(context, {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    timestamp: Date.now(),
  });
  const contentOutput = await onChunk(context, {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: leakedResponse,
    timestamp: Date.now(),
  });
  const endOutput = await onChunk(context, {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  });

  assert.equal((startOutput as StreamChunk).type, EventType.TEXT_MESSAGE_START);
  assert.equal(contentOutput, null);
  assert.ok(Array.isArray(endOutput));
  assert.equal(endOutput[0]?.type, EventType.TEXT_MESSAGE_CONTENT);
  assert.equal(
    endOutput[0]?.type === EventType.TEXT_MESSAGE_CONTENT
      ? endOutput[0].delta
      : null,
    "I found the current week.",
  );
  assert.doesNotMatch(
    JSON.stringify(endOutput),
    /codemode_execute|async\s*\(\s*\)/iu,
  );
});
