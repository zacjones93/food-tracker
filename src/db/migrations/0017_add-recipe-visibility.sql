-- Add visibility column to recipes table
-- Default to 'public' for existing recipes

ALTER TABLE `recipes` ADD `visibility` text DEFAULT 'public' NOT NULL;

-- Create index for visibility filtering
CREATE INDEX `recipes_visibility_idx` ON `recipes` (`visibility`);
