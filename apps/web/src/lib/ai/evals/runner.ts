import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  EvaluationDataset,
  EvaluationReport,
  EvaluationRunRecord,
  EvaluationScores,
  ReleaseGateThresholds,
} from "./types";
import {
  EVALUATION_REPORT_SCHEMA_VERSION,
  evaluationDatasetSchema,
  evaluationRunFileSchema,
} from "./types";
import { evaluateReleaseGate, scoreEvaluation } from "./scoring";

export interface RunEvaluationOptions {
  dataset: EvaluationDataset;
  records: EvaluationRunRecord[];
  baselineScores?: EvaluationScores;
  releaseGateThresholds?: ReleaseGateThresholds;
  outputDirectory?: string;
  generatedAt?: string;
}

export interface RunEvaluationResult {
  report: EvaluationReport;
  reportPath: string;
  summaryPath: string;
  summary: string;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatEvaluationSummary(report: EvaluationReport): string {
  const { scores } = report;
  const gateStatus = report.releaseGate ? (report.releaseGate.passed ? "PASS" : "FAIL") : "NOT EVALUATED";

  return [
    `Food Tracker assistant evaluation: ${report.datasetId}`,
    `Release gate: ${gateStatus}`,
    `Cases: ${scores.completedCaseCount}/${scores.caseCount}`,
    `Recall@1/3/5: ${formatPercent(scores.recallAt1)} / ${formatPercent(scores.recallAt3)} / ${formatPercent(scores.recallAt5)}`,
    `Exact/date accuracy: ${formatPercent(scores.exactDateLookupAccuracy)}`,
    `Correct-week rate: ${formatPercent(scores.correctWeekRate)}`,
    `Fabricated IDs: ${scores.fabricatedIdCount}/${scores.returnedIdCount}`,
    `Cross-team reads: ${scores.crossTeamReadCount}`,
    `Unapproved writes: ${scores.unapprovedWriteCount}`,
    `Plan/tool/compile/runtime failures: ${scores.planFailureCount}/${scores.toolFailureCount}/${scores.codeCompileFailureCount}/${scores.codeRuntimeFailureCount}`,
    `p95 first-token/total/code-mode ms: ${scores.latency.firstTokenMs.p95 ?? "n/a"}/${scores.latency.totalMs.p95 ?? "n/a"}/${scores.latency.codeModeMs.p95 ?? "n/a"}`,
    `Tokens in/out: ${scores.inputTokens}/${scores.outputTokens}`,
    `Total cost: $${scores.totalCostUsd.toFixed(6)}`,
  ].join("\n");
}

export async function runEvaluation({
  dataset,
  records,
  baselineScores,
  releaseGateThresholds,
  outputDirectory = join(tmpdir(), "food-tracker-ai-evals"),
  generatedAt = new Date().toISOString(),
}: RunEvaluationOptions): Promise<RunEvaluationResult> {
  const parsedDataset = evaluationDatasetSchema.parse(dataset);
  const parsedRunFile = evaluationRunFileSchema.parse({ datasetId: parsedDataset.datasetId, records });
  const scores = scoreEvaluation({ dataset: parsedDataset, records: parsedRunFile.records });

  if ((baselineScores && !releaseGateThresholds) || (!baselineScores && releaseGateThresholds))
    throw new Error("Release-gate evaluation requires both baseline scores and thresholds");

  const report: EvaluationReport = {
    schemaVersion: EVALUATION_REPORT_SCHEMA_VERSION,
    datasetId: parsedDataset.datasetId,
    generatedAt,
    scores,
    releaseGate:
      baselineScores && releaseGateThresholds
        ? evaluateReleaseGate({ candidate: scores, baseline: baselineScores, thresholds: releaseGateThresholds })
        : null,
  };
  const summary = formatEvaluationSummary(report);
  const safeTimestamp = generatedAt.replaceAll(":", "-");
  const artifactDirectory = join(outputDirectory, parsedDataset.datasetId, safeTimestamp);
  const reportPath = join(artifactDirectory, "report.json");
  const summaryPath = join(artifactDirectory, "summary.txt");

  await mkdir(artifactDirectory, { recursive: true });
  await Promise.all([
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(summaryPath, `${summary}\n`, "utf8"),
  ]);

  return { report, reportPath, summaryPath, summary };
}

export async function loadRecordedEvaluation({
  datasetPath,
  recordsPath,
}: {
  datasetPath: string;
  recordsPath: string;
}): Promise<{ dataset: EvaluationDataset; records: EvaluationRunRecord[] }> {
  const [datasetJson, recordsJson] = await Promise.all([
    readFile(datasetPath, "utf8"),
    readFile(recordsPath, "utf8"),
  ]);
  const dataset = evaluationDatasetSchema.parse(JSON.parse(datasetJson));
  const runFile = evaluationRunFileSchema.parse(JSON.parse(recordsJson));

  if (runFile.datasetId !== dataset.datasetId)
    throw new Error(`Run file targets ${runFile.datasetId}, expected ${dataset.datasetId}`);

  return { dataset, records: runFile.records };
}
