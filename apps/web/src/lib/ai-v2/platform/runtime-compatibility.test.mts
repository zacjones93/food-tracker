import assert from "node:assert/strict";
import test from "node:test";

import { toolDefinition } from "@tanstack/ai";
import {
  createCodeTool,
  tanstackTools,
} from "@food-tracker/ai-v2-platform-runtime/tanstack";
import { z } from "zod";

const statusTool = toolDefinition({
  name: "status",
  description: "Read the platform status",
  inputSchema: z.object({}),
  outputSchema: z.object({ available: z.literal(true) }),
}).server(async () => ({ available: true as const }));

test("constructs the Code Mode tool from app-owned TanStack tools", () => {
  const codeModeTool = createCodeTool({
    tools: [tanstackTools([statusTool], "platform")],
    executor: {
      async execute() {
        return { result: null };
      },
    },
  });

  assert.equal(codeModeTool.name, "codemode_execute");
  assert.match(codeModeTool.description, /platform/);
  assert.equal(typeof codeModeTool.execute, "function");
});
