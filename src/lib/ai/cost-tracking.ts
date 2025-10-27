import "server-only";
import { aiUsageTable } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

const MODEL_COSTS = {
  // Google Gemini models (primary choice)
  "gemini-2.5-flash": { prompt: 0, completion: 0 }, // Free during preview
  "gemini-2.5-flash-lite": { prompt: 0, completion: 0 }, // Free during preview
  "gemini-1.5-flash": { prompt: 0.00001875, completion: 0.000075 }, // $0.075/$0.30 per 1M tokens
  "gemini-1.5-flash-8b": { prompt: 0.0000075, completion: 0.00003 }, // $0.03/$0.12 per 1M tokens
  "gemini-1.5-pro": { prompt: 0.00125, completion: 0.005 }, // $1.25/$5.00 per 1M tokens

  // OpenAI models (for reference)
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-4o": { prompt: 0.005, completion: 0.015 },
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },

  // Anthropic models (for reference)
  "claude-3-5-sonnet-20241022": { prompt: 0.003, completion: 0.015 },
  "claude-3-haiku-20240307": { prompt: 0.00025, completion: 0.00125 },

  // Cloudflare Workers AI (for reference)
  "@cf/meta/llama-3-8b-instruct": { prompt: 0.000011, completion: 0.000011 },
} as const;

export function calculateCost(
  model: string,
  usage: {
    promptTokens: number;
    completionTokens: number;
  }
): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  return (
    (usage.promptTokens / 1000) * costs.prompt +
    (usage.completionTokens / 1000) * costs.completion
  );
}

export async function trackUsage(
  db: any,
  data: {
    userId: string;
    teamId: string;
    model: string;
    endpoint: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
    conversationId?: string;
  }
) {
  const cost = calculateCost(data.model, {
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
  });

  const now = new Date();

  await db.insert(aiUsageTable).values({
    id: `aiu_${createId()}`,
    userId: data.userId,
    teamId: data.teamId,
    model: data.model,
    endpoint: data.endpoint,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.promptTokens + data.completionTokens,
    estimatedCostUsd: cost.toString(),
    finishReason: data.finishReason,
    conversationId: data.conversationId,
    createdAt: now,
    updatedAt: now,
    updateCounter: 0,
  });

  return cost;
}
