import { evaluationDatasetV1, recordedBaselineV1, recordedCandidateV2 } from "./fixtures";
import { runEvaluation } from "./runner";
import { scoreEvaluation } from "./scoring";

async function main(): Promise<void> {
  const result = await runEvaluation({
    dataset: evaluationDatasetV1,
    records: recordedCandidateV2,
    baselineScores: scoreEvaluation({ dataset: evaluationDatasetV1, records: recordedBaselineV1 }),
    releaseGateThresholds: {
      minimumExactDateAccuracy: 0.9,
      minimumAmbiguousRecallAt3Improvement: 0.05,
      maximumP95TotalLatencyMs: 1_500,
    },
  });
  console.log(result.summary);
  console.log(`Machine report: ${result.reportPath}`);
  console.log(`Human summary: ${result.summaryPath}`);
  if (!result.report.releaseGate?.passed) process.exitCode = 1;
}

void main();
