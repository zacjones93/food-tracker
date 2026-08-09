CREATE TABLE `dial_account_links` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`dialUserRef` text(255) NOT NULL,
	`dialUserLabel` text(255),
	`isActive` integer DEFAULT true NOT NULL,
	`disconnectedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dial_links_listo_user_unique` ON `dial_account_links` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `dial_links_dial_user_unique` ON `dial_account_links` (`dialUserRef`);--> statement-breakpoint
CREATE TABLE `dial_connection_intents` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text(64) NOT NULL,
	`requestedScopes` text NOT NULL,
	`dialUserRef` text(255),
	`dialUserLabel` text(255),
	`dialTeamRef` text(255),
	`dialTeamLabel` text(255),
	`emailHint` text(255),
	`returnUrl` text(1000) NOT NULL,
	`status` text(20) DEFAULT 'pending' NOT NULL,
	`expiresAt` integer NOT NULL,
	`approvedByUserId` text,
	`approvedTeamId` text,
	`approvedAt` integer,
	`consumedAt` integer,
	`result` text,
	FOREIGN KEY (`approvedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approvedTeamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dial_connection_intents_tokenHash_unique` ON `dial_connection_intents` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `dial_intents_status_expiry_idx` ON `dial_connection_intents` (`status`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `dial_recipe_events` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`eventKey` text(500) NOT NULL,
	`recipeId` text,
	`recipeExternalId` text(255) NOT NULL,
	`revision` integer NOT NULL,
	`eventType` text(30) NOT NULL,
	`payload` text NOT NULL,
	`status` text(20) DEFAULT 'pending' NOT NULL,
	`queuedAt` integer,
	`deliveredAt` integer,
	`lastError` text(1000),
	FOREIGN KEY (`recipeId`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dial_recipe_events_eventKey_unique` ON `dial_recipe_events` (`eventKey`);--> statement-breakpoint
CREATE INDEX `dial_events_status_created_idx` ON `dial_recipe_events` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `dial_events_recipe_revision_idx` ON `dial_recipe_events` (`recipeExternalId`,`revision`);--> statement-breakpoint
CREATE TABLE `dial_team_pairings` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`dialTeamRef` text(255) NOT NULL,
	`dialTeamLabel` text(255),
	`connectedByUserId` text,
	`isActive` integer DEFAULT true NOT NULL,
	`disconnectedAt` integer,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connectedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dial_pairings_listo_team_unique` ON `dial_team_pairings` (`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `dial_pairings_dial_team_unique` ON `dial_team_pairings` (`dialTeamRef`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `recipeType` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `dialExternalId` text(255);--> statement-breakpoint
ALTER TABLE `recipes` ADD `dialRevision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `recipes_type_visibility_idx` ON `recipes` (`recipeType`,`visibility`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_dial_external_id_idx` ON `recipes` (`dialExternalId`);