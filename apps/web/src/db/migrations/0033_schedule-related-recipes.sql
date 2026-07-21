ALTER TABLE `recipe_relations` ADD `scheduleLeadDays` integer;--> statement-breakpoint
ALTER TABLE `week_recipes` ADD `scheduledForWeekRecipeId` text REFERENCES week_recipes(id);--> statement-breakpoint
ALTER TABLE `week_recipes` ADD `sourceRecipeRelationId` text REFERENCES recipe_relations(id);--> statement-breakpoint
CREATE INDEX `wr_scheduled_for_idx` ON `week_recipes` (`scheduledForWeekRecipeId`);--> statement-breakpoint
CREATE INDEX `wr_source_relation_idx` ON `week_recipes` (`sourceRecipeRelationId`);