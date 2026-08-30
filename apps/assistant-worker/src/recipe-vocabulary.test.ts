import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantRequestContext } from "./context";
import { loadTeamRecipeVocabulary } from "./recipe-vocabulary";

const context: AssistantRequestContext = {
  userId: "usr_1",
  teamId: "team_1",
  chatId: "chat_1",
  requestId: "req_1",
  runId: "run_1",
  maxOutputTokens: 4_000,
};

test("loads a frequency-ranked, deduplicated vocabulary for only the active team", async () => {
  const bindings: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          bindings.push({ sql, values });
          return {
            async first() {
              return { roleId: "owner", isSystemRole: 1, permissions: null };
            },
            async all() {
              assert.match(sql, /WHERE teamId = \?/u);
              assert.deepEqual(values, [context.teamId]);
              return {
                results: [
                  { emoji: "🍲", mealType: "Dinner", tags: '["Weeknight","Chicken","chicken"]' },
                  { emoji: "🍲", mealType: "dinner", tags: '["Weeknight","One Pot"]' },
                  { emoji: "🍗", mealType: "Lunch", tags: '["Chicken"]' },
                  { emoji: null, mealType: null, tags: "not-json" },
                ],
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  const vocabulary = await loadTeamRecipeVocabulary({ db, context });

  assert.deepEqual(vocabulary, {
    emojis: [
      { value: "🍲", count: 2 },
      { value: "🍗", count: 1 },
    ],
    mealTypes: [
      { value: "Dinner", count: 2 },
      { value: "Lunch", count: 1 },
    ],
    tags: [
      { value: "Chicken", count: 2 },
      { value: "Weeknight", count: 2 },
      { value: "One Pot", count: 1 },
    ],
  });
  assert.deepEqual(bindings[0]?.values, [context.userId, context.teamId]);
});
