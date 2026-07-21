import assert from "node:assert/strict";
import test from "node:test";

import { getAssistantErrorMessage, getPublicAssistantError } from "./errors";

test("assistant failures map to stable typed public messages", () => {
  assert.equal(
    getAssistantErrorMessage("CODE_MODE_EXECUTION_FAILED"),
    "I couldn't safely complete that recipe lookup. Please retry.",
  );
  assert.equal(
    getAssistantErrorMessage("TOOL_FAILURE_PARTIAL"),
    "Some recipe data could not be retrieved, so this answer may be incomplete.",
  );
  assert.equal(
    getPublicAssistantError(),
    "The assistant is temporarily unavailable. Please retry.",
  );
});
