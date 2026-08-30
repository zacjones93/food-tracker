import type { TokenUsage } from "@tanstack/ai";
import {
  createGeminiChat,
  type GeminiTextModel,
} from "@tanstack/ai-gemini";

export const AI_MODEL = "gemini-2.5-flash" as const;
export const GEMINI_THINKING_BUDGET_TOKENS = 512;

const GEMINI_2_5_FLASH_USD_PER_MILLION_TOKENS = {
  standardInput: 0.3,
  audioInput: 1,
  cachedInput: 0.03,
  outputAndThinking: 2.5,
} as const;

export function createGeminiAdapter({
  apiKey,
  model,
}: {
  apiKey: string;
  model: GeminiTextModel;
}) {
  return createGeminiChat(model, apiKey);
}

export function createAiModelOptions({
  maxOutputTokens,
}: {
  maxOutputTokens: number;
}) {
  return {
    maxOutputTokens,
    thinkingConfig: {
      thinkingBudget: GEMINI_THINKING_BUDGET_TOKENS,
      includeThoughts: false,
    },
  } as const;
}

export function calculateEstimatedAiCostUsd({
  model,
  usage,
}: {
  model: string;
  usage: TokenUsage;
}): number {
  if (usage.cost !== undefined) return usage.cost;
  if (model !== AI_MODEL) return 0;

  const cachedInputTokens = Math.min(
    usage.promptTokens,
    usage.promptTokensDetails?.cachedTokens ?? 0,
  );
  const uncachedInputTokens = Math.max(0, usage.promptTokens - cachedInputTokens);
  const audioInputTokens = Math.min(
    uncachedInputTokens,
    usage.promptTokensDetails?.audioTokens ?? 0,
  );
  const standardInputTokens = uncachedInputTokens - audioInputTokens;
  const thinkingTokens = usage.completionTokensDetails?.reasoningTokens ?? 0;

  return (
    standardInputTokens * GEMINI_2_5_FLASH_USD_PER_MILLION_TOKENS.standardInput +
    audioInputTokens * GEMINI_2_5_FLASH_USD_PER_MILLION_TOKENS.audioInput +
    cachedInputTokens * GEMINI_2_5_FLASH_USD_PER_MILLION_TOKENS.cachedInput +
    (usage.completionTokens + thinkingTokens) *
      GEMINI_2_5_FLASH_USD_PER_MILLION_TOKENS.outputAndThinking
  ) / 1_000_000;
}
