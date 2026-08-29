import assert from "node:assert/strict";
import test from "node:test";

import { recipeSearchInputSchema } from "./contracts";

test("retrieval schemas expose Standard Schema JSON conversion", () => {
  assert.equal(
    typeof recipeSearchInputSchema["~standard"].jsonSchema?.input,
    "function",
  );
});
