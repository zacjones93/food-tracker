-- Add autoAddIngredientsToGrocery setting to team_settings table
-- This controls whether recipe ingredients are automatically added to the grocery list
-- when a recipe is added to a schedule

ALTER TABLE team_settings ADD COLUMN autoAddIngredientsToGrocery INTEGER DEFAULT 1 NOT NULL;
