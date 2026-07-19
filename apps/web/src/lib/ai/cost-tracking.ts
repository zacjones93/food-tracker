import "server-only";
import { aiUsageTable } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@/db/schema";

const MODEL_COSTS = {
  // Google Gemini models (primary choice) - updated 2025-10-27 from cloud.google.com/vertex-ai/generative-ai/pricing
  // Rates per 1K tokens: input, output, reasoning (if applicable), cachedInput (if applicable)
  "gemini-2.5-flash": { input: 0.0003, output: 0.0025, reasoning: 0.0003, cachedInput: 0.00015 }, // $0.30/$2.50 per 1M tokens, cached 50% off
  "gemini-2.5-flash-lite": { input: 0.0001, output: 0.0004, reasoning: 0.0001, cachedInput: 0.00005 }, // $0.10/$0.40 per 1M tokens
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003, reasoning: 0.000075, cachedInput: 0.0000375 }, // ~$0.075/$0.30 per 1M tokens
  "gemini-1.5-flash-8b": { input: 0.000075, output: 0.0003, reasoning: 0.000075, cachedInput: 0.0000375 }, // Same as 1.5-flash
  "gemini-1.5-pro": { input: 0.00125, output: 0.005, reasoning: 0.00125, cachedInput: 0.000625 }, // ~$1.25/$5.00 per 1M tokens

  // OpenAI models (for reference)
  "gpt-4": { input: 0.03, output: 0.06, reasoning: 0.03, cachedInput: 0.015 },
  "gpt-4o": { input: 0.005, output: 0.015, reasoning: 0.005, cachedInput: 0.0025 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006, reasoning: 0.00015, cachedInput: 0.000075 },

  // Anthropic models (for reference)
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015, reasoning: 0.003, cachedInput: 0.0015 },
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125, reasoning: 0.00025, cachedInput: 0.000125 },

  // Cloudflare Workers AI (for reference)
  "@cf/meta/llama-3-8b-instruct": { input: 0.000011, output: 0.000011, reasoning: 0.000011, cachedInput: 0.0000055 },
} as const;

export function calculateCost(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  }
): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  const inputCost = (usage.inputTokens / 1000) * costs.input;
  const outputCost = (usage.outputTokens / 1000) * costs.output;
  const reasoningCost = ((usage.reasoningTokens || 0) / 1000) * costs.reasoning;
  const cachedInputCost = ((usage.cachedInputTokens || 0) / 1000) * costs.cachedInput;

  return inputCost + outputCost + reasoningCost + cachedInputCost;
}

export async function trackUsage(
  db: DrizzleD1Database<typeof schema>,
  data: {
    userId: string;
    teamId: string;
    model: string;
    endpoint: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
    finishReason?: string;
    conversationId?: string;
  }
) {
  const cost = calculateCost(data.model, {
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    reasoningTokens: data.reasoningTokens,
    cachedInputTokens: data.cachedInputTokens,
  });

  const now = new Date();

  const totalTokens =
    data.inputTokens +
    data.outputTokens +
    (data.reasoningTokens || 0) +
    (data.cachedInputTokens || 0);

  await db.insert(aiUsageTable).values({
    id: `aiu_${createId()}`,
    userId: data.userId,
    teamId: data.teamId,
    model: data.model,
    endpoint: data.endpoint,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    reasoningTokens: data.reasoningTokens || 0,
    cachedInputTokens: data.cachedInputTokens || 0,
    totalTokens,
    estimatedCostUsd: cost.toString(),
    finishReason: data.finishReason,
    conversationId: data.conversationId,
    createdAt: now,
    updatedAt: now,
    updateCounter: 0,
  });

  return cost;
}
