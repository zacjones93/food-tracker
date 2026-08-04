DROP INDEX `push_preferences_team_user_unique`;--> statement-breakpoint
ALTER TABLE `notification_push_preferences` ADD `topic` text(100) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `push_preferences_team_user_topic_unique` ON `notification_push_preferences` (`teamId`,`userId`,`topic`);