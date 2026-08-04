import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantRequestContext } from "./context";
import {
  applyApprovedTeamChanges,
  approvedMutationInputSchema,
  createApprovedMutationTool,
} from "./mutation-tool";

const context: AssistantRequestContext = {
  userId: "usr_1",
  teamId: "team_1",
  chatId: "chat_1",
  requestId: "req_1",
  runId: "run_1",
  maxOutputTokens: 4_000,
};

function fakeDatabase({ ownsTarget }: { ownsTarget: boolean }): {
  db: D1Database;
  statements: string[];
  batchCalls: D1PreparedStatement[][];
} {
  const statements: string[] = [];
  const batchCalls: D1PreparedStatement[][] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("FROM team_membership")) {
                return { roleId: "owner", isSystemRole: 1, permissions: null };
              }
              if (sql.includes("FROM grocery_items")) {
                return ownsTarget ? { id: "gi_1" } : null;
              }
              if (sql.includes("FROM recipes r")) {
                return ownsTarget ? { id: "rcp_1" } : null;
              }
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(batchStatements: D1PreparedStatement[]) {
      batchCalls.push(batchStatements);
      return batchStatements.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
  return { db, statements, batchCalls };
}

test("mutation contract requires IDs and keeps settings update-only", () => {
  assert.equal(approvedMutationInputSchema.safeParse({
    reason: "Update item",
    changes: [{ entity: "groceryItem", operation: "update", data: { checked: true } }],
  }).success, false);
  assert.equal(approvedMutationInputSchema.safeParse({
    reason: "Create settings",
    changes: [{ entity: "teamSettings", operation: "create", data: {} }],
  }).success, false);
});

test("write tool always requires explicit approval", () => {
  const { db } = fakeDatabase({ ownsTarget: true });
  const tool = createApprovedMutationTool({ db, context });
  assert.equal(tool.needsApproval, true);
});

test("cross-team targets fail before any write statement executes", async () => {
  const { db, statements, batchCalls } = fakeDatabase({ ownsTarget: false });
  await assert.rejects(
    applyApprovedTeamChanges({
      db,
      context,
      changes: [{
        entity: "groceryItem",
        operation: "update",
        id: "gi_other_team",
        data: { checked: true },
      }],
    }),
    /not found in the active team/,
  );
  assert.equal(statements.some((statement) => statement.startsWith("UPDATE ")), false);
  assert.equal(batchCalls.length, 0);
});

test("owned updates keep the team predicate in the write query", async () => {
  const { db, statements, batchCalls } = fakeDatabase({ ownsTarget: true });
  const result = await applyApprovedTeamChanges({
    db,
    context,
    changes: [{
      entity: "groceryItem",
      operation: "update",
      id: "gi_1",
      data: { checked: true },
    }],
  });
  assert.equal(result.success, true);
  assert.equal(batchCalls.length, 1);
  assert.equal(batchCalls[0]?.length, 1);
  const update = statements.find((statement) => statement.startsWith("UPDATE grocery_items"));
  assert.match(update ?? "", /weekId IN \(SELECT id FROM weeks WHERE teamId = \?\)/);
});

test("multiple approved changes execute in one atomic D1 batch", async () => {
  const { db, batchCalls } = fakeDatabase({ ownsTarget: true });
  const result = await applyApprovedTeamChanges({
    db,
    context,
    changes: [
      {
        entity: "groceryItem",
        operation: "update",
        id: "gi_1",
        data: { checked: true },
      },
      {
        entity: "groceryItem",
        operation: "delete",
        id: "gi_2",
        data: {},
      },
    ],
  });
  assert.equal(result.applied.length, 2);
  assert.equal(batchCalls.length, 1);
  assert.equal(batchCalls[0]?.length, 2);
});

test("recipe remixes persist the approved source recipe ID", async () => {
  const { db, statements, batchCalls } = fakeDatabase({ ownsTarget: true });
  const result = await applyApprovedTeamChanges({
    db,
    context,
    changes: [{
      entity: "recipe",
      operation: "create",
      data: {
        name: "Tomato soup remix",
        sourceRecipeId: "rcp_1",
        ingredients: [{ items: ["Tomatoes"] }],
      },
    }],
  });

  assert.equal(result.success, true);
  assert.equal(batchCalls.length, 1);
  const insert = statements.find((statement) => statement.startsWith("INSERT INTO recipes"));
  assert.match(insert ?? "", /sourceRecipeId/);
});
