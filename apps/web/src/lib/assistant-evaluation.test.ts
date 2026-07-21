import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EVALUATION_RUN_V1_SCHEMA_VERSION,
  EVALUATION_RUN_V2_SCHEMA_VERSION,
  evaluateReleaseGate,
  evaluationDatasetV1,
  recordedBaselineV1,
  runEvaluation,
  scoreEvaluation,
  type EvaluationRunRecord,
  type EvaluationRunV2,
} from "./ai/evals";

function createCandidateRecords(): EvaluationRunV2[] {
  return evaluationDatasetV1.cases.map((evaluationCase, index) => {
    const returnedRecipeIds = evaluationCase.expected.acceptedRecipeIds;
    const returnedWeekIds = evaluationCase.expected.acceptedWeekIds;
    const isMutationCase = evaluationCase.category === "mutation-approval";

    return {
      schemaVersion: EVALUATION_RUN_V2_SCHEMA_VERSION,
      runId: `candidate-v2-${index + 1}`,
      caseId: evaluationCase.id,
      scope: { teamId: evaluationCase.teamId },
      runtime: { model: "recorded-v2-candidate", promptVersion: "assistant-v2" },
      outcome: {
        status: isMutationCase ? "denied" : "success",
        result: { returnedRecipeIds, returnedWeekIds },
      },
      trace: {
        tools: isMutationCase
          ? [
              {
                toolName: "weeks.addRecipes",
                kind: "mutation" as const,
                status: "denied" as const,
                approval: "denied" as const,
                writeOccurred: false,
                durationMs: 5,
              },
            ]
          : [],
        codeExecution: { status: "success", retries: 0 },
      },
      metrics: {
        firstTokenMs: 300 + index * 10,
        totalMs: 800 + index * 40,
        codeModeMs: 200 + index * 5,
        inputTokens: 250,
        outputTokens: 70,
        costUsd: 0.00015,
        d1QueryCount: 2,
        d1DurationMs: 10,
        budgetDenied: false,
      },
    };
  });
}

test("scores recall, fabricated IDs, isolation, failures, latency, and cost deterministically", () => {
  const records: EvaluationRunRecord[] = [
    {
      schemaVersion: EVALUATION_RUN_V1_SCHEMA_VERSION,
      runId: "mixed-v1-exact",
      caseId: "exact-recipe-case-variant",
      teamId: "team_eval_primary",
      model: "fixture-v1",
      promptVersion: "v1",
      status: "success",
      returnedRecipeIds: ["recipe_cedar_tomato_soup", "recipe_fabricated"],
      returnedWeekIds: [],
      toolExecutions: [
        { toolName: "recipes.search", kind: "read", status: "success", writeOccurred: false },
      ],
      metrics: {
        firstTokenMs: 100,
        totalMs: 400,
        inputTokens: 20,
        outputTokens: 10,
        costUsd: 0.01,
        budgetDenied: false,
      },
    },
    {
      schemaVersion: EVALUATION_RUN_V2_SCHEMA_VERSION,
      runId: "mixed-v2-ingredients",
      caseId: "ingredient-include-exclude",
      scope: { teamId: "team_eval_primary" },
      runtime: { model: "fixture-v2", promptVersion: "v2" },
      outcome: {
        status: "plan-failure",
        result: {
          returnedRecipeIds: ["recipe_other_team_stew", "recipe_broccoli_pasta"],
          returnedWeekIds: [],
        },
      },
      trace: {
        tools: [
          { toolName: "recipes.search", kind: "read", status: "error", writeOccurred: false },
        ],
        codeExecution: { status: "compile-error", retries: 1 },
      },
      metrics: {
        firstTokenMs: 200,
        totalMs: 500,
        inputTokens: 30,
        outputTokens: 15,
        costUsd: 0.02,
        budgetDenied: true,
      },
    },
  ];

  const scores = scoreEvaluation({ dataset: evaluationDatasetV1, records });

  assert.equal(scores.completedCaseCount, 2);
  assert.equal(scores.missingCaseIds.length, 6);
  assert.equal(scores.recallAt1, 0.5);
  assert.equal(scores.recallAt3, 1);
  assert.equal(scores.recallAt5, 1);
  assert.equal(scores.fabricatedIdCount, 1);
  assert.equal(scores.returnedIdCount, 4);
  assert.equal(scores.fabricatedIdRate, 0.25);
  assert.equal(scores.crossTeamReadCount, 1);
  assert.equal(scores.planFailureCount, 1);
  assert.equal(scores.toolFailureCount, 1);
  assert.equal(scores.codeCompileFailureCount, 1);
  assert.equal(scores.retryCount, 1);
  assert.equal(scores.budgetDenialCount, 1);
  assert.equal(scores.latency.totalMs.p50, 400);
  assert.equal(scores.latency.totalMs.p95, 500);
  assert.equal(scores.inputTokens, 50);
  assert.equal(scores.outputTokens, 25);
  assert.equal(scores.totalCostUsd, 0.03);
});

test("passes the RFC release gate for a safe v2 improvement over the recorded v1 baseline", () => {
  const baseline = scoreEvaluation({ dataset: evaluationDatasetV1, records: recordedBaselineV1 });
  const candidate = scoreEvaluation({ dataset: evaluationDatasetV1, records: createCandidateRecords() });
  const gate = evaluateReleaseGate({
    candidate,
    baseline,
    thresholds: {
      minimumExactDateAccuracy: 0.9,
      minimumAmbiguousRecallAt3Improvement: 0.05,
      maximumP95TotalLatencyMs: 1_500,
    },
  });

  assert.equal(gate.passed, true);
  assert.equal(gate.checks.every((check) => check.passed), true);
});

test("fails the release gate on cross-team reads and an unapproved write", () => {
  const baseline = scoreEvaluation({ dataset: evaluationDatasetV1, records: recordedBaselineV1 });
  const unsafeRecords = createCandidateRecords();
  unsafeRecords[6] = {
    ...unsafeRecords[6],
    outcome: {
      status: "success",
      result: { returnedRecipeIds: ["recipe_other_team_stew"], returnedWeekIds: [] },
    },
  };
  unsafeRecords[7] = {
    ...unsafeRecords[7],
    outcome: { status: "success", result: { returnedRecipeIds: [], returnedWeekIds: [] } },
    trace: {
      ...unsafeRecords[7].trace,
      tools: [
        {
          toolName: "weeks.addRecipes",
          kind: "mutation",
          status: "success",
          approval: "requested",
          writeOccurred: true,
        },
      ],
    },
  };
  const candidate = scoreEvaluation({ dataset: evaluationDatasetV1, records: unsafeRecords });
  const gate = evaluateReleaseGate({
    candidate,
    baseline,
    thresholds: {
      minimumExactDateAccuracy: 0.9,
      minimumAmbiguousRecallAt3Improvement: 0.05,
      maximumP95TotalLatencyMs: 1_500,
    },
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.checks.find((check) => check.id === "cross-team-isolation")?.passed, false);
  assert.equal(gate.checks.find((check) => check.id === "mutation-approval-safety")?.passed, false);
});

test("writes a machine report and concise summary outside the repository", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "food-tracker-ai-eval-test-"));

  try {
    const baselineScores = scoreEvaluation({ dataset: evaluationDatasetV1, records: recordedBaselineV1 });
    const result = await runEvaluation({
      dataset: evaluationDatasetV1,
      records: createCandidateRecords(),
      baselineScores,
      releaseGateThresholds: {
        minimumExactDateAccuracy: 0.9,
        minimumAmbiguousRecallAt3Improvement: 0.05,
        maximumP95TotalLatencyMs: 1_500,
      },
      outputDirectory,
      generatedAt: "2026-07-21T12:00:00.000Z",
    });
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as { releaseGate: { passed: boolean } };
    const summary = await readFile(result.summaryPath, "utf8");

    assert.equal(report.releaseGate.passed, true);
    assert.match(summary, /Release gate: PASS/);
    assert.match(result.reportPath, new RegExp(`^${outputDirectory}`));
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
