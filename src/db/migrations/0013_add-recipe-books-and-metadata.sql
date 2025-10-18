-- Migration number: 0013 	 2025-10-17T19:45:00.000Z

-- Create recipe_books table
CREATE TABLE recipe_books (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);

CREATE INDEX recipe_books_name_idx ON recipe_books(name);

-- Add recipe metadata columns to recipes table
ALTER TABLE recipes ADD COLUMN recipeLink TEXT;
ALTER TABLE recipes ADD COLUMN recipeBookId TEXT REFERENCES recipe_books(id) ON DELETE SET NULL;
ALTER TABLE recipes ADD COLUMN page TEXT;

-- Create index for recipeBookId
CREATE INDEX recipes_book_idx ON recipes(recipeBookId);
