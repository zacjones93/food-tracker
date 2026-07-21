import assert from "node:assert/strict";
import test from "node:test";

import { parseAssistantRequestContext } from "./context";
import { READ_ONLY_TOOL_MANIFEST } from "./tool-policy";

test("Code Mode exposes only the vetted read-only retrieval manifest", () => {
  assert.deepEqual(READ_ONLY_TOOL_MANIFEST, {
    recipes: ["search", "getMany", "facets"],
    weeks: ["search", "getMany", "findForRecipes"],
    recipeBooks: ["search"],
    groceryTemplates: ["search"],
    groceryItems: ["search"],
    weekRecipes: ["search"],
    recipeRelations: ["search"],
    settings: ["getFoodPlanning"],
  });
  const serialized = JSON.stringify(READ_ONLY_TOOL_MANIFEST);
  assert.doesNotMatch(serialized, /create|update|delete|write|mutation/i);
});

test("assistant context requires bounded server-derived identifiers", () => {
  const request = new Request("https://assistant.internal/v1/chat", {
    method: "POST",
    headers: {
      "x-assistant-user-id": "usr_1",
      "x-assistant-team-id": "team_1",
      "x-assistant-chat-id": "chat_1",
      "x-request-id": "req_1",
      "x-run-id": "run_1",
      "x-assistant-max-output-tokens": "4000",
    },
  });
  assert.deepEqual(parseAssistantRequestContext(request), {
    userId: "usr_1",
    teamId: "team_1",
    chatId: "chat_1",
    requestId: "req_1",
    runId: "run_1",
    maxOutputTokens: 4000,
  });
});
