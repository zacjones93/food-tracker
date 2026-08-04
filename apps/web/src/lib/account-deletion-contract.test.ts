import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionRequestSchema,
} from "./account-deletion-contract";

test("requires the destructive phrase and a plausible current password", () => {
  assert.deepEqual(
    accountDeletionRequestSchema.parse({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      password: "current-password",
    }),
    { confirmation: "DELETE", password: "current-password" },
  );

  assert.equal(
    accountDeletionRequestSchema.safeParse({
      confirmation: "delete",
      password: "current-password",
    }).success,
    false,
  );
  assert.equal(
    accountDeletionRequestSchema.safeParse({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      password: "short",
    }).success,
    false,
  );
});
