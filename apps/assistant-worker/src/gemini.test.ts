import assert from "node:assert/strict";
import test from "node:test";

import { calculateEstimatedAiCostUsd, GEMINI_MODEL } from "./gemini";

test("prices Gemini 2.5 Flash text input and output tokens", () => {
  const cost = calculateEstimatedAiCostUsd({
    model: GEMINI_MODEL,
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
    model: GEMINI_MODEL,
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

  assert.equal(calculateEstimatedAiCostUsd({ model: GEMINI_MODEL, usage }), 0.123);
  assert.equal(
    calculateEstimatedAiCostUsd({
      model: "unknown",
      usage: { ...usage, cost: undefined },
    }),
    0,
  );
});
