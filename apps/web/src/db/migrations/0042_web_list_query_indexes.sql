CREATE INDEX `wr_recipe_week_idx` ON `week_recipes` (`recipeId`,`weekId`);--> statement-breakpoint
CREATE INDEX `weeks_team_start_idx` ON `weeks` (`teamId`,`startDate`);