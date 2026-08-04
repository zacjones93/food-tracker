import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveAssistantMention,
  insertAssistantMention,
} from "./assistant-mentions";

test("finds a trailing mention query without treating email addresses as mentions", () => {
  assert.deepEqual(getActiveAssistantMention({ value: "Compare @tomato so" }), {
    start: 8,
    end: 18,
    query: "tomato so",
  });
  assert.equal(getActiveAssistantMention({ value: "chef@example.com" }), null);
});

test("inserts a selected context at the active mention and preserves trailing text", () => {
  const value = "Compare @soup with dinner";
  const mention = getActiveAssistantMention({ value, cursor: 13 });
  assert.ok(mention);

  assert.deepEqual(
    insertAssistantMention({
      value,
      mention,
      context: {
        kind: "recipe",
        entityId: "recipe-1",
        label: "Tomato Soup",
        href: "/recipes/recipe-1",
      },
    }),
    {
      value: "Compare @Tomato Soup with dinner",
      cursor: 20,
    },
  );
});
