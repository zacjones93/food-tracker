CREATE TABLE `sync_changes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`teamId` text NOT NULL,
	`entityType` text(50) NOT NULL,
	`entityId` text(255) NOT NULL,
	`version` integer NOT NULL,
	`operation` text(20) NOT NULL,
	`changedFields` text NOT NULL,
	`serverUpdatedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_changes_team_sequence_idx` ON `sync_changes` (`teamId`,`sequence`);--> statement-breakpoint
CREATE INDEX `sync_changes_entity_version_idx` ON `sync_changes` (`teamId`,`entityType`,`entityId`,`version`);--> statement-breakpoint
CREATE TABLE `sync_entities` (
	`teamId` text NOT NULL,
	`entityType` text(50) NOT NULL,
	`entityId` text(255) NOT NULL,
	`clientId` text(255),
	`version` integer DEFAULT 1 NOT NULL,
	`deletedAt` integer,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`teamId`, `entityType`, `entityId`),
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_entities_client_idx` ON `sync_entities` (`teamId`,`entityType`,`clientId`);--> statement-breakpoint
CREATE INDEX `sync_entities_updated_idx` ON `sync_entities` (`teamId`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `sync_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`entityType` text(50) NOT NULL,
	`operation` text(20) NOT NULL,
	`clientEntityId` text(255),
	`serverEntityId` text(255),
	`result` text NOT NULL,
	`appliedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_mutations_team_idx` ON `sync_mutations` (`teamId`,`appliedAt`);--> statement-breakpoint
CREATE INDEX `sync_mutations_client_entity_idx` ON `sync_mutations` (`teamId`,`entityType`,`clientEntityId`);--> statement-breakpoint
ALTER TABLE `grocery_items` ADD `clientId` text(255);--> statement-breakpoint
CREATE UNIQUE INDEX `gi_client_id_idx` ON `grocery_items` (`clientId`);--> statement-breakpoint
ALTER TABLE `grocery_list_templates` ADD `clientId` text(255);--> statement-breakpoint
CREATE UNIQUE INDEX `glt_client_id_idx` ON `grocery_list_templates` (`clientId`);--> statement-breakpoint
ALTER TABLE `recipe_books` ADD `clientId` text(255);--> statement-breakpoint
ALTER TABLE `recipe_books` ADD `updatedAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_books_client_id_idx` ON `recipe_books` (`clientId`);--> statement-breakpoint
ALTER TABLE `recipe_relations` ADD `clientId` text(255);--> statement-breakpoint
ALTER TABLE `recipe_relations` ADD `updatedAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `rr_client_id_idx` ON `recipe_relations` (`clientId`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `clientId` text(255);--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_team_client_id_idx` ON `recipes` (`teamId`,`clientId`);--> statement-breakpoint
ALTER TABLE `week_recipes` ADD `clientId` text(255);--> statement-breakpoint
ALTER TABLE `week_recipes` ADD `updatedAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `wr_client_id_idx` ON `week_recipes` (`clientId`);--> statement-breakpoint
ALTER TABLE `weeks` ADD `clientId` text(255);--> statement-breakpoint
CREATE UNIQUE INDEX `weeks_team_client_id_idx` ON `weeks` (`teamId`,`clientId`);
