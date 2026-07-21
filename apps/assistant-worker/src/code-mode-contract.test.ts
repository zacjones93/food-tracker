import assert from "node:assert/strict";
import test from "node:test";

import {
  CODE_MODE_ACCEPTANCE_EXAMPLES,
  CODE_MODE_DESCRIPTION,
  RECIPE_NAMESPACE_TYPES,
  WEEK_NAMESPACE_TYPES,
} from "./code-mode-contract";

test("Code Mode declarations expose only exact read-only namespaces and envelopes", () => {
  const declarations = `${RECIPE_NAMESPACE_TYPES}\n${WEEK_NAMESPACE_TYPES}`;
  assert.match(declarations, /declare const recipes/);
  assert.match(declarations, /declare const weeks/);
  assert.match(declarations, /type RetrievalResult<T> = \{ ok: true; data: T \}/);
  assert.match(declarations, /mealTypes\?: string\[\]/);
  assert.match(declarations, /ids: string\[\]/);
  assert.match(declarations, /items: RecipeSummary\[\]/);
  assert.match(declarations, /items: WeekSummary\[\]/);
  assert.doesNotMatch(declarations, /declare const codemode/);
  assert.doesNotMatch(declarations, /\b(create|update|delete|write)\s*\(/i);
});

test("acceptance examples avoid namespace collisions and incorrect response shapes", () => {
  for (const code of Object.values(CODE_MODE_ACCEPTANCE_EXAMPLES)) {
    assert.doesNotMatch(code, /\b(?:const|let|var)\s+(?:recipes|weeks)\b/);
    assert.doesNotMatch(code, /codemode\./);
    assert.doesNotMatch(code, /\.results\b|\.weeks\b/);
    assert.match(code, /\.ok/);
  }
  assert.match(CODE_MODE_ACCEPTANCE_EXAMPLES.chickenSearch, /mealTypes: \["Dinner"\]/);
  assert.match(CODE_MODE_ACCEPTANCE_EXAMPLES.currentSchedule, /onDate: "2026-07-21"/);
  assert.match(CODE_MODE_ACCEPTANCE_EXAMPLES.twoRecipeComparison, /recipes\.getMany\(\{\s*ids:/s);
  assert.match(CODE_MODE_DESCRIPTION, /There is no codemode namespace/);
});
