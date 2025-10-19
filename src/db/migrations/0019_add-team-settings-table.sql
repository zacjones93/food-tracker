-- Create team_settings table
CREATE TABLE `team_settings` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`recipeVisibilityMode` text(20) DEFAULT 'all' NOT NULL,
	`defaultRecipeVisibility` text(20) DEFAULT 'public' NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create index on teamId for fast lookups
CREATE INDEX `tset_team_idx` ON `team_settings` (`teamId`);

-- Create unique constraint on teamId (one settings record per team)
CREATE UNIQUE INDEX `team_settings_teamId_unique` ON `team_settings` (`teamId`);
