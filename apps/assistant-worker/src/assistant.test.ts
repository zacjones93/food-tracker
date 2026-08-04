import assert from "node:assert/strict";
import test from "node:test";

import type { Executor } from "@cloudflare/codemode";

import { createAssistantCodeTool } from "./code-mode-tool";

test("Code Mode preserves actionable executor errors for model retries", async () => {
  const executor: Executor = {
    async execute() {
      return {
        result: null,
        error: "ReferenceError: recipes is not defined",
      };
    },
  };
  const codeTool = createAssistantCodeTool({ executor, tools: [] });
  const execute = codeTool.execute;
  assert.ok(execute);

  await assert.rejects(
    async () => execute({ code: "async () => recipes.search({})" }),
    /Code execution failed: ReferenceError: recipes is not defined/,
  );
});
