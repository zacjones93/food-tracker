-- Migration: Add teamId to recipes table
-- This makes recipes team-scoped so only team members can access/edit them
-- Note: Uses DEFAULT to populate existing rows, then adds foreign key constraint

-- Step 1: Add column with default value for existing rows
ALTER TABLE `recipes` ADD `teamId` text NOT NULL DEFAULT 'team_default';

-- Step 2: Create index
CREATE INDEX `recipes_team_idx` ON `recipes` (`teamId`);

-- Step 3: Note - SQLite doesn't support adding foreign key constraints after table creation
-- The foreign key will be enforced on new inserts via application logic and schema
-- Full constraint enforcement requires table recreation which we'll handle on next full reseed