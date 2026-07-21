import { z } from "zod";

export const EVALUATION_CASE_SCHEMA_VERSION = "food-tracker.ai-eval.case.v1" as const;
export const EVALUATION_RUN_V1_SCHEMA_VERSION = "food-tracker.ai-eval.run.v1" as const;
export const EVALUATION_RUN_V2_SCHEMA_VERSION = "food-tracker.ai-eval.run.v2" as const;
export const EVALUATION_REPORT_SCHEMA_VERSION = "food-tracker.ai-eval.report.v1" as const;

export const evaluationCategoryValues = [
  "exact-recipe",
  "ingredients",
  "vague-intent",
  "date-week",
  "recipe-week-history",
  "no-result",
  "isolation",
  "mutation-approval",
] as const;

export const evaluationCategorySchema = z.enum(evaluationCategoryValues);

const catalogEntitySchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  label: z.string().min(1),
});

const expectedResultSchema = z.object({
  acceptedRecipeIds: z.array(z.string().min(1)).default([]),
  acceptedWeekIds: z.array(z.string().min(1)).default([]),
  primaryWeekId: z.string().min(1).optional(),
  noResult: z.boolean().default(false),
  writePolicy: z.enum(["none", "approval-required"]).default("none"),
});

export const evaluationCaseSchema = z.object({
  id: z.string().min(1),
  category: evaluationCategorySchema,
  teamId: z.string().min(1),
  prompt: z.string().min(1),
  expected: expectedResultSchema,
  notes: z.string().min(1).optional(),
});

export const evaluationDatasetSchema = z.object({
  schemaVersion: z.literal(EVALUATION_CASE_SCHEMA_VERSION),
  datasetId: z.string().min(1),
  description: z.string().min(1),
  syntheticDataOnly: z.literal(true),
  recipes: z.array(catalogEntitySchema),
  weeks: z.array(catalogEntitySchema),
  cases: z.array(evaluationCaseSchema).min(1),
});

const toolExecutionSchema = z.object({
  toolName: z.string().min(1),
  kind: z.enum(["read", "mutation"]),
  status: z.enum(["success", "error", "denied"]),
  durationMs: z.number().nonnegative().optional(),
  approval: z.enum(["not-required", "requested", "approved", "denied", "expired"]).optional(),
  writeOccurred: z.boolean().default(false),
});

const runMetricsSchema = z.object({
  firstTokenMs: z.number().nonnegative().optional(),
  totalMs: z.number().nonnegative().optional(),
  codeModeMs: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  d1QueryCount: z.number().int().nonnegative().optional(),
  d1DurationMs: z.number().nonnegative().optional(),
  budgetDenied: z.boolean().default(false),
});

const runResultSchema = z.object({
  returnedRecipeIds: z.array(z.string().min(1)).default([]),
  returnedWeekIds: z.array(z.string().min(1)).default([]),
});

const codeExecutionSchema = z.object({
  status: z.enum(["not-used", "success", "compile-error", "runtime-error"]),
  retries: z.number().int().nonnegative().default(0),
});

export const evaluationRunV1Schema = z.object({
  schemaVersion: z.literal(EVALUATION_RUN_V1_SCHEMA_VERSION),
  runId: z.string().min(1),
  caseId: z.string().min(1),
  teamId: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  status: z.enum(["success", "plan-failure", "error", "denied"]),
  returnedRecipeIds: z.array(z.string().min(1)).default([]),
  returnedWeekIds: z.array(z.string().min(1)).default([]),
  toolExecutions: z.array(toolExecutionSchema).default([]),
  metrics: runMetricsSchema.default({}),
});

export const evaluationRunV2Schema = z.object({
  schemaVersion: z.literal(EVALUATION_RUN_V2_SCHEMA_VERSION),
  runId: z.string().min(1),
  caseId: z.string().min(1),
  scope: z.object({ teamId: z.string().min(1) }),
  runtime: z.object({
    model: z.string().min(1),
    promptVersion: z.string().min(1),
  }),
  outcome: z.object({
    status: z.enum(["success", "plan-failure", "error", "denied"]),
    result: runResultSchema,
  }),
  trace: z.object({
    tools: z.array(toolExecutionSchema).default([]),
    codeExecution: codeExecutionSchema.default({ status: "not-used", retries: 0 }),
  }),
  metrics: runMetricsSchema.default({}),
});

export const evaluationRunSchema = z.discriminatedUnion("schemaVersion", [
  evaluationRunV1Schema,
  evaluationRunV2Schema,
]);

export const evaluationRunFileSchema = z.object({
  datasetId: z.string().min(1),
  records: z.array(evaluationRunSchema),
});

export interface CatalogEntity extends z.infer<typeof catalogEntitySchema> {}
export interface EvaluationCase extends z.infer<typeof evaluationCaseSchema> {}
export interface EvaluationDataset extends z.infer<typeof evaluationDatasetSchema> {}
export interface EvaluationRunV1 extends z.infer<typeof evaluationRunV1Schema> {}
export interface EvaluationRunV2 extends z.infer<typeof evaluationRunV2Schema> {}
export type EvaluationRunRecord = z.infer<typeof evaluationRunSchema>;
export type EvaluationCategory = z.infer<typeof evaluationCategorySchema>;
export type ToolExecution = z.infer<typeof toolExecutionSchema>;
export type RunMetrics = z.infer<typeof runMetricsSchema>;

export interface NormalizedEvaluationRun {
  runId: string;
  caseId: string;
  teamId: string;
  model: string;
  promptVersion: string;
  status: "success" | "plan-failure" | "error" | "denied";
  returnedRecipeIds: string[];
  returnedWeekIds: string[];
  toolExecutions: ToolExecution[];
  codeExecution: {
    status: "not-used" | "success" | "compile-error" | "runtime-error";
    retries: number;
  };
  metrics: RunMetrics;
}

export interface DistributionSummary {
  count: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface EvaluationScores {
  caseCount: number;
  completedCaseCount: number;
  missingCaseIds: string[];
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  ambiguousRecallAt3: number;
  exactDateLookupAccuracy: number;
  correctWeekRate: number;
  noResultAccuracy: number;
  fabricatedIdCount: number;
  returnedIdCount: number;
  fabricatedIdRate: number;
  crossTeamReadCount: number;
  unapprovedWriteCount: number;
  mutationWriteCount: number;
  planFailureCount: number;
  toolFailureCount: number;
  codeCompileFailureCount: number;
  codeRuntimeFailureCount: number;
  retryCount: number;
  budgetDenialCount: number;
  d1QueryCount: number;
  d1DurationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  averageCostUsd: number | null;
  latency: {
    firstTokenMs: DistributionSummary;
    totalMs: DistributionSummary;
    codeModeMs: DistributionSummary;
  };
}

export interface ReleaseGateThresholds {
  minimumExactDateAccuracy: number;
  minimumAmbiguousRecallAt3Improvement: number;
  maximumP95TotalLatencyMs: number;
}

export interface ReleaseGateCheck {
  id: string;
  passed: boolean;
  actual: number | null;
  required: string;
}

export interface ReleaseGateResult {
  passed: boolean;
  checks: ReleaseGateCheck[];
}

export interface EvaluationReport {
  schemaVersion: typeof EVALUATION_REPORT_SCHEMA_VERSION;
  datasetId: string;
  generatedAt: string;
  scores: EvaluationScores;
  releaseGate: ReleaseGateResult | null;
}
