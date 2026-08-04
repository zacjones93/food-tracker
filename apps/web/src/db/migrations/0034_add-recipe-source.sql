ALTER TABLE `recipes` ADD `sourceRecipeId` text REFERENCES recipes(id) ON DELETE SET NULL;
