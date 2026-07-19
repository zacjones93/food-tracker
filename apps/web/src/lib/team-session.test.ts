import assert from "node:assert/strict";
import test from "node:test";

import { signInSchema } from "@/schemas/signin.schema";
import { signUpSchema } from "@/schemas/signup.schema";
import { selectActiveTeamId } from "./team-session";

test("keeps a default team only while its membership is active", () => {
  assert.equal(
    selectActiveTeamId({
      defaultTeamId: "team-default",
      memberships: [{ teamId: "team-default" }, { teamId: "team-other" }],
    }),
    "team-default",
  );
});

test("falls back to an active membership when the stored default is stale", () => {
  assert.equal(
    selectActiveTeamId({
      defaultTeamId: "team-removed",
      memberships: [{ teamId: "team-active" }, { teamId: "team-other" }],
    }),
    "team-active",
  );
});

test("does not invent an active team for a user without active memberships", () => {
  assert.equal(
    selectActiveTeamId({
      defaultTeamId: "team-removed",
      memberships: [],
    }),
    undefined,
  );
});

test("normalizes the same account identity for sign in and sign up", () => {
  const signIn = signInSchema.parse({
    email: "  CHEF@EXAMPLE.COM ",
    password: "password123",
  });
  const signUp = signUpSchema.parse({
    email: "  CHEF@EXAMPLE.COM ",
    firstName: "  Ada ",
    lastName: " Lovelace  ",
    password: "password123",
  });

  assert.equal(signIn.email, "chef@example.com");
  assert.equal(signUp.email, "chef@example.com");
  assert.equal(signUp.firstName, "Ada");
  assert.equal(signUp.lastName, "Lovelace");
});
