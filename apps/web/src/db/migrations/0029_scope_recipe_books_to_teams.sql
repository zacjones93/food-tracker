ALTER TABLE `recipe_books` ADD `teamId` text REFERENCES team(id);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_books_team_name_idx` ON `recipe_books` (`teamId`,`name`);