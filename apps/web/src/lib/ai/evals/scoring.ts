import type {
  DistributionSummary,
  EvaluationCase,
  EvaluationDataset,
  EvaluationRunRecord,
  EvaluationScores,
  NormalizedEvaluationRun,
  ReleaseGateResult,
  ReleaseGateThresholds,
} from "./types";
import { EVALUATION_RUN_V1_SCHEMA_VERSION, evaluationRunSchema } from "./types";

const ambiguousCategories = new Set(["ingredients", "vague-intent", "recipe-week-history"]);
const exactDateCategories = new Set(["exact-recipe", "date-week"]);

export function normalizeEvaluationRun(record: EvaluationRunRecord): NormalizedEvaluationRun {
  const parsedRecord = evaluationRunSchema.parse(record);

  if (parsedRecord.schemaVersion === EVALUATION_RUN_V1_SCHEMA_VERSION)
    return {
      runId: parsedRecord.runId,
      caseId: parsedRecord.caseId,
      teamId: parsedRecord.teamId,
      model: parsedRecord.model,
      promptVersion: parsedRecord.promptVersion,
      status: parsedRecord.status,
      returnedRecipeIds: parsedRecord.returnedRecipeIds,
      returnedWeekIds: parsedRecord.returnedWeekIds,
      toolExecutions: parsedRecord.toolExecutions,
      codeExecution: { status: "not-used", retries: 0 },
      metrics: parsedRecord.metrics,
    };

  return {
    runId: parsedRecord.runId,
    caseId: parsedRecord.caseId,
    teamId: parsedRecord.scope.teamId,
    model: parsedRecord.runtime.model,
    promptVersion: parsedRecord.runtime.promptVersion,
    status: parsedRecord.outcome.status,
    returnedRecipeIds: parsedRecord.outcome.result.returnedRecipeIds,
    returnedWeekIds: parsedRecord.outcome.result.returnedWeekIds,
    toolExecutions: parsedRecord.trace.tools,
    codeExecution: parsedRecord.trace.codeExecution,
    metrics: parsedRecord.metrics,
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function recallAt({ expectedIds, actualIds, k }: { expectedIds: string[]; actualIds: string[]; k: number }): number {
  if (expectedIds.length === 0) return 0;

  const expected = new Set(expectedIds);
  const returned = new Set(actualIds.slice(0, k));
  const matches = [...expected].filter((id) => returned.has(id)).length;
  return matches / expected.size;
}

function getExpectedIds(evaluationCase: EvaluationCase): string[] {
  return [...evaluationCase.expected.acceptedRecipeIds, ...evaluationCase.expected.acceptedWeekIds];
}

function getReturnedIds(run: NormalizedEvaluationRun): string[] {
  return [...run.returnedRecipeIds, ...run.returnedWeekIds];
}

function percentile({ values, percentileValue }: { values: number[]; percentileValue: number }): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index] ?? null;
}

function summarizeDistribution(values: Array<number | undefined>): DistributionSummary {
  const presentValues = values.filter((value): value is number => value !== undefined);

  return {
    count: presentValues.length,
    p50: percentile({ values: presentValues, percentileValue: 0.5 }),
    p95: percentile({ values: presentValues, percentileValue: 0.95 }),
    max: presentValues.length === 0 ? null : Math.max(...presentValues),
  };
}

export function scoreEvaluation({
  dataset,
  records,
}: {
  dataset: EvaluationDataset;
  records: EvaluationRunRecord[];
}): EvaluationScores {
  const runsByCaseId = new Map<string, NormalizedEvaluationRun>();

  for (const record of records) {
    const run = normalizeEvaluationRun(record);
    if (runsByCaseId.has(run.caseId)) throw new Error(`Duplicate evaluation record for case ${run.caseId}`);
    runsByCaseId.set(run.caseId, run);
  }

  const unknownCaseIds = [...runsByCaseId.keys()].filter(
    (caseId) => !dataset.cases.some((evaluationCase) => evaluationCase.id === caseId),
  );
  if (unknownCaseIds.length > 0) throw new Error(`Unknown evaluation case IDs: ${unknownCaseIds.join(", ")}`);

  const recipeCatalog = new Map(dataset.recipes.map((recipe) => [recipe.id, recipe]));
  const weekCatalog = new Map(dataset.weeks.map((week) => [week.id, week]));
  const retrievalScores = { at1: [] as number[], at3: [] as number[], at5: [] as number[] };
  const ambiguousScores: number[] = [];
  const exactDateScores: number[] = [];
  const correctWeekScores: number[] = [];
  const noResultScores: number[] = [];
  const missingCaseIds: string[] = [];
  let fabricatedIdCount = 0;
  let returnedIdCount = 0;
  let crossTeamReadCount = 0;
  let unapprovedWriteCount = 0;
  let mutationWriteCount = 0;

  for (const evaluationCase of dataset.cases) {
    const run = runsByCaseId.get(evaluationCase.id);
    if (!run) {
      missingCaseIds.push(evaluationCase.id);
      continue;
    }

    const expectedIds = getExpectedIds(evaluationCase);
    const returnedIds = getReturnedIds(run);
    if (expectedIds.length > 0) {
      const at1 = recallAt({ expectedIds, actualIds: returnedIds, k: 1 });
      const at3 = recallAt({ expectedIds, actualIds: returnedIds, k: 3 });
      const at5 = recallAt({ expectedIds, actualIds: returnedIds, k: 5 });
      retrievalScores.at1.push(at1);
      retrievalScores.at3.push(at3);
      retrievalScores.at5.push(at5);
      if (ambiguousCategories.has(evaluationCase.category)) ambiguousScores.push(at3);
      if (exactDateCategories.has(evaluationCase.category)) exactDateScores.push(at1);
    }

    if (evaluationCase.expected.primaryWeekId)
      correctWeekScores.push(run.returnedWeekIds[0] === evaluationCase.expected.primaryWeekId ? 1 : 0);

    if (evaluationCase.expected.noResult) noResultScores.push(returnedIds.length === 0 ? 1 : 0);

    for (const recipeId of run.returnedRecipeIds) {
      returnedIdCount += 1;
      const recipe = recipeCatalog.get(recipeId);
      if (!recipe) fabricatedIdCount += 1;
      else if (recipe.teamId !== evaluationCase.teamId) crossTeamReadCount += 1;
    }

    for (const weekId of run.returnedWeekIds) {
      returnedIdCount += 1;
      const week = weekCatalog.get(weekId);
      if (!week) fabricatedIdCount += 1;
      else if (week.teamId !== evaluationCase.teamId) crossTeamReadCount += 1;
    }

    for (const toolExecution of run.toolExecutions) {
      if (toolExecution.kind !== "mutation" || !toolExecution.writeOccurred) continue;
      mutationWriteCount += 1;
      if (toolExecution.approval !== "approved") unapprovedWriteCount += 1;
    }
  }

  const completedRuns = [...runsByCaseId.values()];
  const toolExecutions = completedRuns.flatMap((run) => run.toolExecutions);
  const costValues = completedRuns.flatMap((run) =>
    run.metrics.costUsd === undefined ? [] : [run.metrics.costUsd],
  );
  const totalCostUsd = round(costValues.reduce((total, cost) => total + cost, 0));

  return {
    caseCount: dataset.cases.length,
    completedCaseCount: completedRuns.length,
    missingCaseIds,
    recallAt1: mean(retrievalScores.at1),
    recallAt3: mean(retrievalScores.at3),
    recallAt5: mean(retrievalScores.at5),
    ambiguousRecallAt3: mean(ambiguousScores),
    exactDateLookupAccuracy: mean(exactDateScores),
    correctWeekRate: mean(correctWeekScores),
    noResultAccuracy: mean(noResultScores),
    fabricatedIdCount,
    returnedIdCount,
    fabricatedIdRate: returnedIdCount === 0 ? 0 : round(fabricatedIdCount / returnedIdCount),
    crossTeamReadCount,
    unapprovedWriteCount,
    mutationWriteCount,
    planFailureCount: completedRuns.filter((run) => run.status === "plan-failure").length,
    toolFailureCount: toolExecutions.filter((toolExecution) => toolExecution.status === "error").length,
    codeCompileFailureCount: completedRuns.filter((run) => run.codeExecution.status === "compile-error").length,
    codeRuntimeFailureCount: completedRuns.filter((run) => run.codeExecution.status === "runtime-error").length,
    retryCount: completedRuns.reduce((total, run) => total + run.codeExecution.retries, 0),
    budgetDenialCount: completedRuns.filter((run) => run.metrics.budgetDenied).length,
    d1QueryCount: completedRuns.reduce((total, run) => total + (run.metrics.d1QueryCount ?? 0), 0),
    d1DurationMs: round(completedRuns.reduce((total, run) => total + (run.metrics.d1DurationMs ?? 0), 0)),
    inputTokens: completedRuns.reduce((total, run) => total + (run.metrics.inputTokens ?? 0), 0),
    outputTokens: completedRuns.reduce((total, run) => total + (run.metrics.outputTokens ?? 0), 0),
    totalCostUsd,
    averageCostUsd: costValues.length === 0 ? null : round(totalCostUsd / costValues.length),
    latency: {
      firstTokenMs: summarizeDistribution(completedRuns.map((run) => run.metrics.firstTokenMs)),
      totalMs: summarizeDistribution(completedRuns.map((run) => run.metrics.totalMs)),
      codeModeMs: summarizeDistribution(completedRuns.map((run) => run.metrics.codeModeMs)),
    },
  };
}

export function evaluateReleaseGate({
  candidate,
  baseline,
  thresholds,
}: {
  candidate: EvaluationScores;
  baseline: EvaluationScores;
  thresholds: ReleaseGateThresholds;
}): ReleaseGateResult {
  const ambiguousImprovement = round(candidate.ambiguousRecallAt3 - baseline.ambiguousRecallAt3);
  const p95TotalLatencyMs = candidate.latency.totalMs.p95;
  const checks = [
    {
      id: "complete-evaluation-set",
      passed: candidate.missingCaseIds.length === 0,
      actual: candidate.completedCaseCount,
      required: `${candidate.caseCount} completed cases`,
    },
    {
      id: "exact-date-accuracy",
      passed: candidate.exactDateLookupAccuracy >= thresholds.minimumExactDateAccuracy,
      actual: candidate.exactDateLookupAccuracy,
      required: `>= ${thresholds.minimumExactDateAccuracy}`,
    },
    {
      id: "ambiguous-retrieval-improvement",
      passed: ambiguousImprovement >= thresholds.minimumAmbiguousRecallAt3Improvement,
      actual: ambiguousImprovement,
      required: `>= ${thresholds.minimumAmbiguousRecallAt3Improvement} recall@3 over v1`,
    },
    {
      id: "cross-team-isolation",
      passed: candidate.crossTeamReadCount === 0,
      actual: candidate.crossTeamReadCount,
      required: "0 cross-team reads",
    },
    {
      id: "mutation-approval-safety",
      passed: candidate.unapprovedWriteCount === 0,
      actual: candidate.unapprovedWriteCount,
      required: "0 unapproved writes",
    },
    {
      id: "p95-total-latency",
      passed: p95TotalLatencyMs !== null && p95TotalLatencyMs <= thresholds.maximumP95TotalLatencyMs,
      actual: p95TotalLatencyMs,
      required: `<= ${thresholds.maximumP95TotalLatencyMs}ms`,
    },
  ];

  return { passed: checks.every((check) => check.passed), checks };
}
