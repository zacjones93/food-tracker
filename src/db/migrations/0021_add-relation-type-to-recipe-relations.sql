-- Migration number: 0021 	 2025-10-22T00:00:00.000Z

-- Add relationType and order columns to recipe_relations table
ALTER TABLE recipe_relations ADD COLUMN relationType TEXT DEFAULT 'side' NOT NULL;
ALTER TABLE recipe_relations ADD COLUMN "order" INTEGER DEFAULT 0 NOT NULL;
