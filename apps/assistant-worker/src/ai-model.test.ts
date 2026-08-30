import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MODEL,
  calculateEstimatedAiCostUsd,
  createGeminiAdapter,
  createAiModelOptions,
  GEMINI_THINKING_BUDGET_TOKENS,
} from "./ai-model";

test("configures the Gemini adapter with a bounded thinking budget", () => {
  const adapter = createGeminiAdapter({
    apiKey: "test-key",
    model: AI_MODEL,
  });

  assert.equal(adapter.model, AI_MODEL);
  assert.equal(adapter.name, "gemini");
  assert.equal(GEMINI_THINKING_BUDGET_TOKENS, 512);
  assert.deepEqual(createAiModelOptions({ maxOutputTokens: 4_096 }), {
    maxOutputTokens: 4_096,
    thinkingConfig: {
      thinkingBudget: 512,
      includeThoughts: false,
    },
  });
});

test("prices Gemini 2.5 Flash text input and output tokens", () => {
  const cost = calculateEstimatedAiCostUsd({
    model: AI_MODEL,
    usage: {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    },
  });

  assert.equal(cost, 2.8);
});

test("prices cached input, audio input, and thinking at their correct rates", () => {
  const cost = calculateEstimatedAiCostUsd({
    model: AI_MODEL,
    usage: {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      totalTokens: 1_600_000,
      promptTokensDetails: {
        cachedTokens: 250_000,
        audioTokens: 100_000,
      },
      completionTokensDetails: { reasoningTokens: 100_000 },
    },
  });

  assert.equal(cost, 1.8025);
});

test("prefers provider-reported cost and does not price unknown models", () => {
  const usage = {
    promptTokens: 1_000,
    completionTokens: 1_000,
    totalTokens: 2_000,
    cost: 0.123,
  };

  assert.equal(calculateEstimatedAiCostUsd({ model: AI_MODEL, usage }), 0.123);
  assert.equal(
    calculateEstimatedAiCostUsd({
      model: "unknown",
      usage: { ...usage, cost: undefined },
    }),
    0,
  );
});
