-- Migration number: 0027 	 2025-10-27T22:00:00.000Z

-- Update ai_usage table to use new token field names
-- SQLite doesn't support renaming columns directly, so we need to recreate the table

-- Step 1: Create new table with updated schema
CREATE TABLE ai_usage_new (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  teamId TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  model TEXT(100) NOT NULL,
  endpoint TEXT(255) NOT NULL,
  inputTokens INTEGER NOT NULL,
  outputTokens INTEGER NOT NULL,
  reasoningTokens INTEGER DEFAULT 0 NOT NULL,
  cachedInputTokens INTEGER DEFAULT 0 NOT NULL,
  totalTokens INTEGER NOT NULL,
  estimatedCostUsd TEXT NOT NULL,
  conversationId TEXT(255),
  finishReason TEXT(50),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

-- Step 2: Copy data from old table to new table (rename promptTokens → inputTokens, completionTokens → outputTokens)
INSERT INTO ai_usage_new (
  id, userId, teamId, model, endpoint,
  inputTokens, outputTokens, reasoningTokens, cachedInputTokens, totalTokens,
  estimatedCostUsd, conversationId, finishReason,
  createdAt, updatedAt, updateCounter
)
SELECT
  id, userId, teamId, model, endpoint,
  promptTokens, completionTokens, 0, 0, totalTokens,
  estimatedCostUsd, conversationId, finishReason,
  createdAt, updatedAt, updateCounter
FROM ai_usage;

-- Step 3: Drop old table
DROP TABLE ai_usage;

-- Step 4: Rename new table to original name
ALTER TABLE ai_usage_new RENAME TO ai_usage;

-- Step 5: Recreate indexes
CREATE INDEX ai_usage_user_idx ON ai_usage(userId);
CREATE INDEX ai_usage_team_idx ON ai_usage(teamId);
CREATE INDEX ai_usage_created_idx ON ai_usage(createdAt);
