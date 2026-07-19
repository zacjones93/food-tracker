-- Migration number: 0010 	 2025-10-17T16:52:30.000Z

-- Add recipeBody column to recipes table
ALTER TABLE recipes ADD COLUMN recipeBody TEXT;
