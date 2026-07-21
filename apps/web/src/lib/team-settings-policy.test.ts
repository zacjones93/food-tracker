import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TEAM_SETTINGS, evaluateAiTeamPolicy } from "./team-settings-policy";

const enabledSettings = {
  aiEnabled: true,
  aiMonthlyBudgetUsd: "10.0",
  aiMaxTokensPerRequest: 4_000,
  aiMaxRequestsPerDay: 100,
};

test("new teams are provisioned with AI safely disabled", () => {
  assert.deepEqual(DEFAULT_TEAM_SETTINGS, { aiEnabled: false });
});

test("normal teams are eligible through membership and explicit policy, not slug", () => {
  assert.deepEqual(
    evaluateAiTeamPolicy({ hasActiveMembership: true, settings: enabledSettings }),
    { allowed: true },
  );
});

test("missing policy, disabled policy, and inactive membership are denied", () => {
  assert.equal(evaluateAiTeamPolicy({ hasActiveMembership: true, settings: null }).allowed, false);
  assert.equal(evaluateAiTeamPolicy({
    hasActiveMembership: true,
    settings: { ...enabledSettings, aiEnabled: false },
  }).allowed, false);
  assert.equal(evaluateAiTeamPolicy({ hasActiveMembership: false, settings: enabledSettings }).allowed, false);
});
