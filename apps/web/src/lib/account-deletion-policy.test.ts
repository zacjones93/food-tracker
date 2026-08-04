import assert from "node:assert/strict";
import test from "node:test";

import { createAccountDeletionPreview } from "./account-deletion-policy";

const userId = "user-delete";

test("deletes only teams where the account is the sole member", () => {
  const preview = createAccountDeletionPreview({
    userId,
    memberships: [
      membership({ teamId: "personal", teamName: "Personal", userId, roleId: "owner" }),
      membership({ teamId: "shared", teamName: "Shared", userId, roleId: "member" }),
      membership({ teamId: "shared", teamName: "Shared", userId: "other", roleId: "owner" }),
    ],
  });

  assert.equal(preview.canDelete, true);
  assert.deepEqual(preview.deletedTeams, [{ id: "personal", name: "Personal" }]);
  assert.deepEqual(preview.leftTeams, [{ id: "shared", name: "Shared" }]);
  assert.deepEqual(preview.ownershipTransferRequired, []);
});

test("blocks a sole owner from orphaning a shared team", () => {
  const preview = createAccountDeletionPreview({
    userId,
    memberships: [
      membership({ teamId: "shared", teamName: "Family kitchen", userId, roleId: "owner" }),
      membership({ teamId: "shared", teamName: "Family kitchen", userId: "member", roleId: "member" }),
    ],
  });

  assert.equal(preview.canDelete, false);
  assert.deepEqual(preview.ownershipTransferRequired, [
    { id: "shared", name: "Family kitchen" },
  ]);
});

test("allows a co-owner to leave while preserving shared data", () => {
  const preview = createAccountDeletionPreview({
    userId,
    memberships: [
      membership({ teamId: "shared", teamName: "Family kitchen", userId, roleId: "owner" }),
      membership({ teamId: "shared", teamName: "Family kitchen", userId: "co-owner", roleId: "owner" }),
    ],
  });

  assert.equal(preview.canDelete, true);
  assert.deepEqual(preview.leftTeams, [{ id: "shared", name: "Family kitchen" }]);
});

test("does not silently delete a team that still has an inactive member", () => {
  const preview = createAccountDeletionPreview({
    userId,
    memberships: [
      membership({ teamId: "shared", teamName: "Archived family", userId, roleId: "owner" }),
      membership({
        teamId: "shared",
        teamName: "Archived family",
        userId: "inactive-member",
        roleId: "member",
        isActive: 0,
      }),
    ],
  });

  assert.equal(preview.canDelete, false);
  assert.deepEqual(preview.deletedTeams, []);
});

function membership(
  values: Partial<ReturnType<typeof membershipDefaults>> &
    Pick<ReturnType<typeof membershipDefaults>, "teamId" | "teamName" | "userId" | "roleId">,
) {
  return { ...membershipDefaults(), ...values };
}

function membershipDefaults() {
  return {
    isActive: 1,
    roleId: "member",
    teamId: "team",
    teamName: "Team",
    userId: "user",
  };
}
