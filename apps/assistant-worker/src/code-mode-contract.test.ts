import assert from "node:assert/strict";
import test from "node:test";

import { CODE_MODE_ACCEPTANCE_EXAMPLES } from "./code-mode-contract";

test("acceptance examples use TanStack Code Mode's generated external APIs", () => {
  for (const code of Object.values(CODE_MODE_ACCEPTANCE_EXAMPLES)) {
    assert.match(code, /external_(?:recipe|week)/u);
    assert.doesNotMatch(
      code,
      /async\s*\(\s*\)\s*=>|codemode\.|recipes\.|weeks\./u,
    );
    assert.doesNotMatch(code, /\.results\b|\.weeks\b/u);
    assert.match(code, /\.ok/u);
  }
  assert.match(
    CODE_MODE_ACCEPTANCE_EXAMPLES.chickenSearch,
    /mealType: string/u,
  );
  assert.match(
    CODE_MODE_ACCEPTANCE_EXAMPLES.currentSchedule,
    /onDate: "2026-07-21"/u,
  );
  assert.match(
    CODE_MODE_ACCEPTANCE_EXAMPLES.twoRecipeComparison,
    /Promise\.all/u,
  );
  assert.match(
    CODE_MODE_ACCEPTANCE_EXAMPLES.twoRecipeComparison,
    /external_recipeGetMany/u,
  );
});
