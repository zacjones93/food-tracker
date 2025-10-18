-- Team Re-Integration: Add team tables and foreign keys

-- Create team table
CREATE TABLE `team` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`slug` text(255) NOT NULL,
	`description` text(1000),
	`avatarUrl` text(600)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_slug_unique` ON `team` (`slug`);

-- Create team_membership table
--> statement-breakpoint
CREATE TABLE `team_membership` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`invitedBy` text,
	`joinedAt` integer,
	`isActive` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tm_team_idx` ON `team_membership` (`teamId`);
--> statement-breakpoint
CREATE INDEX `tm_user_idx` ON `team_membership` (`userId`);

-- Create team_role table
--> statement-breakpoint
CREATE TABLE `team_role` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(1000),
	`permissions` text NOT NULL,
	`metadata` text(5000),
	`isEditable` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tr_team_idx` ON `team_role` (`teamId`);

-- Create team_invitation table
--> statement-breakpoint
CREATE TABLE `team_invitation` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`email` text(255) NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`token` text(255) NOT NULL,
	`invitedBy` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`acceptedBy` text,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acceptedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invitation_token_unique` ON `team_invitation` (`token`);
--> statement-breakpoint
CREATE INDEX `ti_team_idx` ON `team_invitation` (`teamId`);
--> statement-breakpoint
CREATE INDEX `ti_token_idx` ON `team_invitation` (`token`);

-- Create default team (needed for FK constraint)
--> statement-breakpoint
INSERT INTO `team` (id, name, slug, description, createdAt, updatedAt, updateCounter)
VALUES ('team_default', 'Default Team', 'default', 'Default team for food tracking', strftime('%s', 'now'), strftime('%s', 'now'), 0);

-- Add teamId to weeks table (requires recreation in SQLite)
--> statement-breakpoint
CREATE TABLE `weeks_new` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`name` text(255) NOT NULL,
	`emoji` text(10),
	`status` text(50) DEFAULT 'upcoming' NOT NULL,
	`startDate` integer,
	`endDate` integer,
	`weekNumber` integer,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `weeks_new` SELECT createdAt, updatedAt, updateCounter, id, 'team_default' as teamId, name, emoji, status, startDate, endDate, weekNumber FROM `weeks`;
--> statement-breakpoint
DROP TABLE `weeks`;
--> statement-breakpoint
ALTER TABLE `weeks_new` RENAME TO `weeks`;
--> statement-breakpoint
CREATE INDEX `weeks_team_idx` ON `weeks` (`teamId`);
--> statement-breakpoint
CREATE INDEX `weeks_status_idx` ON `weeks` (`status`);
--> statement-breakpoint
CREATE INDEX `weeks_start_date_idx` ON `weeks` (`startDate`);

-- Add teamId and isDefault to grocery_list_templates (requires recreation in SQLite)
--> statement-breakpoint
CREATE TABLE `grocery_list_templates_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`template` text NOT NULL,
	`teamId` text,
	`isDefault` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `grocery_list_templates_new` SELECT id, name, template, NULL as teamId, 0 as isDefault, createdAt, updatedAt FROM `grocery_list_templates`;
--> statement-breakpoint
DROP TABLE `grocery_list_templates`;
--> statement-breakpoint
ALTER TABLE `grocery_list_templates_new` RENAME TO `grocery_list_templates`;
--> statement-breakpoint
CREATE INDEX `glt_name_idx` ON `grocery_list_templates` (`name`);
--> statement-breakpoint
CREATE INDEX `glt_team_idx` ON `grocery_list_templates` (`teamId`);
--> statement-breakpoint
CREATE INDEX `glt_default_idx` ON `grocery_list_templates` (`isDefault`);
