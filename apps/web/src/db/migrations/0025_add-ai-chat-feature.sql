-- Migration number: 0025 	 2025-10-27T04:30:00.000Z

-- Add AI usage tracking table
CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  teamId TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  model TEXT(100) NOT NULL,
  endpoint TEXT(255) NOT NULL,
  promptTokens INTEGER NOT NULL,
  completionTokens INTEGER NOT NULL,
  totalTokens INTEGER NOT NULL,
  estimatedCostUsd TEXT NOT NULL,
  conversationId TEXT(255),
  finishReason TEXT(50),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

-- Add indexes for ai_usage table
CREATE INDEX ai_usage_user_idx ON ai_usage(userId);
CREATE INDEX ai_usage_team_idx ON ai_usage(teamId);
CREATE INDEX ai_usage_created_idx ON ai_usage(createdAt);

-- Add AI feature flags to team_settings table
ALTER TABLE team_settings ADD COLUMN aiEnabled INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE team_settings ADD COLUMN aiMonthlyBudgetUsd TEXT DEFAULT '10.0';
ALTER TABLE team_settings ADD COLUMN aiMaxTokensPerRequest INTEGER DEFAULT 4000;
ALTER TABLE team_settings ADD COLUMN aiMaxRequestsPerDay INTEGER DEFAULT 100;
