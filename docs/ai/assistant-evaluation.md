# Assistant evaluation harness

The RFC baseline is implemented in `apps/web/src/lib/ai/evals`. It is offline-only: scoring consumes recorded run data and never invokes a model, database, or network service.

## Versioned formats

- Dataset/cases: `food-tracker.ai-eval.case.v1`
- Legacy run records: `food-tracker.ai-eval.run.v1`
- V2 trace records: `food-tracker.ai-eval.run.v2`
- Reports: `food-tracker.ai-eval.report.v1`

Every case has an explicit `teamId`. The dataset catalog also assigns each synthetic recipe and week to a team. This lets the scorer distinguish a fabricated ID from a real but cross-team ID without logging production content.

The seeded `food-tracker-rfc-baseline-v1` dataset covers exact recipe lookup, ingredient include/exclude, vague intent, date-to-week lookup, recipe-to-week history, no results, cross-team isolation, and mutation approval. Names and IDs are synthetic examples, not copied production records.

V1 records use flat result and trace fields. V2 records separate `scope`, `runtime`, `outcome`, and `trace`, including Code Mode compile/runtime status and retries. Both normalize to the same deterministic scoring input.

## Metrics and release gate

The report includes recall@1/3/5, ambiguous recall@3, exact/date accuracy, correct-week and no-result rates, fabricated IDs, cross-team reads, unapproved writes, plan/tool/compile/runtime failures, retries, D1 queries and duration, token counts, gateway cost, budget denials, and p50/p95/max latency.

Release-gate evaluation requires a recorded v1 baseline and explicit thresholds. The RFC checks are:

- at least 90% exact/date accuracy;
- a configured material improvement in ambiguous recall@3 over v1 (the test baseline uses five percentage points);
- zero cross-team reads;
- zero unapproved writes;
- candidate p95 total latency at or below the agreed ceiling;
- a complete evaluation set.

Missing latency does not pass the latency gate. A write counts as unapproved unless its recorded approval state is exactly `approved`.

## Running offline

From `apps/web`, run the committed baseline fixture:

```bash
pnpm exec tsx src/lib/ai/evals/run-baseline.ts
```

The runner writes `report.json` and `summary.txt` below the operating system temp directory, normally `/tmp/food-tracker-ai-evals`. This keeps potentially sensitive future run artifacts outside the repository and therefore outside git.

For recorded JSON files, use `loadRecordedEvaluation({ datasetPath, recordsPath })`, then pass the result to `runEvaluation()`. The run file shape is:

```json
{
  "datasetId": "food-tracker-rfc-baseline-v1",
  "records": [
    {
      "schemaVersion": "food-tracker.ai-eval.run.v1",
      "runId": "recorded-run-1",
      "caseId": "exact-recipe-case-variant",
      "teamId": "team_eval_primary",
      "model": "model-name",
      "promptVersion": "prompt-v1",
      "status": "success",
      "returnedRecipeIds": ["recipe_cedar_tomato_soup"],
      "returnedWeekIds": [],
      "toolExecutions": [],
      "metrics": { "totalMs": 900, "costUsd": 0.0002 }
    }
  ]
}
```

Run focused tests with `pnpm test`; the discoverable entry is `apps/web/src/lib/assistant-evaluation.test.ts`.
