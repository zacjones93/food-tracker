-- Fix string 'null' values in recipes table
-- These were imported from the Notion scraper which incorrectly set null values as the string 'null'

UPDATE recipes SET recipeLink = NULL WHERE recipeLink = 'null';
UPDATE recipes SET recipeBookId = NULL WHERE recipeBookId = 'null';
UPDATE recipes SET page = NULL WHERE page = 'null';
