import assert from "node:assert/strict";
import test from "node:test";

import type { Tool } from "@tanstack/ai";

import { validateReadOnlyToolNamespaces } from "./read-only-tools";

function createTool({
  name,
  needsApproval = false,
}: {
  name: string;
  needsApproval?: boolean;
}): Tool {
  return {
    name,
    description: `${name} test tool`,
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: {} },
    needsApproval,
    execute: async () => ({}),
  };
}

test("accepts distinct namespaces containing executable read tools", () => {
  assert.doesNotThrow(() =>
    validateReadOnlyToolNamespaces({
      namespaces: [
        { name: "recipes", tools: [createTool({ name: "search" })] },
        { name: "weeks", tools: [createTool({ name: "get_many" })] },
      ],
    }),
  );
});

test("rejects approval-required tools from stateless Code Mode", () => {
  assert.throws(
    () =>
      validateReadOnlyToolNamespaces({
        namespaces: [
          {
            name: "recipes",
            tools: [createTool({ name: "update", needsApproval: true })],
          },
        ],
      }),
    /cannot run in stateless Code Mode/,
  );
});

test("rejects invalid or duplicate sandbox namespaces", () => {
  assert.throws(
    () =>
      validateReadOnlyToolNamespaces({
        namespaces: [
          { name: "recipes", tools: [createTool({ name: "search-recipes" })] },
        ],
      }),
    /Invalid Code Mode tool name/,
  );

  assert.throws(
    () =>
      validateReadOnlyToolNamespaces({
        namespaces: [{ name: "recipe-tools", tools: [createTool({ name: "search" })] }],
      }),
    /Invalid Code Mode namespace/,
  );

  assert.throws(
    () =>
      validateReadOnlyToolNamespaces({
        namespaces: [
          { name: "recipes", tools: [createTool({ name: "search" })] },
          { name: "recipes", tools: [createTool({ name: "get_many" })] },
        ],
      }),
    /Duplicate Code Mode namespace/,
  );
});
