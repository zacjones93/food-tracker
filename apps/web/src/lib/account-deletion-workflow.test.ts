import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountDeletionBlockedError,
  executeAccountDeletionWorkflow,
  type AccountDeletionWorkflowSteps,
} from "./account-deletion-workflow";

test("revokes access, removes account-owned resources, and deletes the user last", async () => {
  const calls: string[] = [];
  const result = await executeAccountDeletionWorkflow({
    preview: {
      canDelete: true,
      deletedTeams: [{ id: "personal", name: "Personal" }],
      leftTeams: [{ id: "shared", name: "Shared" }],
      ownershipTransferRequired: [],
    },
    steps: createSteps(calls),
  });

  assert.deepEqual(calls, [
    "block-sessions",
    "delete-push-devices",
    "delete-assistant-data",
    "delete-stripe:personal",
    "clean-user-references",
    "delete-teams:personal",
    "delete-user",
    "delete-sessions",
  ]);
  assert.deepEqual(result, { deleted: true, deletedTeamCount: 1, leftTeamCount: 1 });
});

test("does not mutate anything when ownership transfer is required", async () => {
  const calls: string[] = [];

  await assert.rejects(
    executeAccountDeletionWorkflow({
      preview: {
        canDelete: false,
        deletedTeams: [],
        leftTeams: [],
        ownershipTransferRequired: [{ id: "shared", name: "Shared" }],
      },
      steps: createSteps(calls),
    }),
    AccountDeletionBlockedError,
  );
  assert.deepEqual(calls, []);
});

test("restores the session gate if destructive cleanup fails before user deletion", async () => {
  const calls: string[] = [];
  const steps = createSteps(calls);
  steps.deleteStripeCustomers = async () => {
    calls.push("delete-stripe:personal");
    throw new Error("Stripe unavailable");
  };

  await assert.rejects(
    executeAccountDeletionWorkflow({
      preview: {
        canDelete: true,
        deletedTeams: [{ id: "personal", name: "Personal" }],
        leftTeams: [],
        ownershipTransferRequired: [],
      },
      steps,
    }),
    /Stripe unavailable/,
  );
  assert.equal(calls.at(-1), "unblock-sessions");
  assert.equal(calls.includes("delete-user"), false);
});

test("keeps the account deleted when stale session cleanup fails", async () => {
  const calls: string[] = [];
  const steps = createSteps(calls);
  steps.deleteUserSessions = async () => {
    calls.push("delete-sessions");
    throw new Error("KV unavailable");
  };

  const result = await executeAccountDeletionWorkflow({
    preview: {
      canDelete: true,
      deletedTeams: [],
      leftTeams: [],
      ownershipTransferRequired: [],
    },
    steps,
  });

  assert.equal(result.deleted, true);
  assert.equal(calls.includes("unblock-sessions"), false);
});

function createSteps(calls: string[]): AccountDeletionWorkflowSteps {
  return {
    blockSessions: async () => { calls.push("block-sessions"); },
    cleanUserReferences: async () => { calls.push("clean-user-references"); },
    deleteAssistantData: async () => { calls.push("delete-assistant-data"); },
    deletePushDevices: async () => { calls.push("delete-push-devices"); },
    deleteStripeCustomers: async (teamIds) => { calls.push(`delete-stripe:${teamIds.join(",")}`); },
    deleteTeams: async (teamIds) => { calls.push(`delete-teams:${teamIds.join(",")}`); },
    deleteUser: async () => { calls.push("delete-user"); },
    deleteUserSessions: async () => { calls.push("delete-sessions"); },
    unblockSessions: async () => { calls.push("unblock-sessions"); },
  };
}
