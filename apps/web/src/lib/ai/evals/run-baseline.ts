import { evaluationDatasetV1, recordedBaselineV1 } from "./fixtures";
import { runEvaluation } from "./runner";

async function main(): Promise<void> {
  const result = await runEvaluation({
    dataset: evaluationDatasetV1,
    records: recordedBaselineV1,
  });

  console.log(result.summary);
  console.log(`Machine report: ${result.reportPath}`);
  console.log(`Human summary: ${result.summaryPath}`);
}

void main();
