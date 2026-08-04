PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_team_invitation` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`email` text(255) NOT NULL,
	`roleId` text NOT NULL,
	`isSystemRole` integer DEFAULT 1 NOT NULL,
	`token` text(255) NOT NULL,
	`invitedBy` text,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`acceptedBy` text,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`acceptedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_team_invitation`("createdAt", "updatedAt", "updateCounter", "id", "teamId", "email", "roleId", "isSystemRole", "token", "invitedBy", "expiresAt", "acceptedAt", "acceptedBy") SELECT "createdAt", "updatedAt", "updateCounter", "id", "teamId", "email", "roleId", "isSystemRole", "token", "invitedBy", "expiresAt", "acceptedAt", "acceptedBy" FROM `team_invitation`;--> statement-breakpoint
DROP TABLE `team_invitation`;--> statement-breakpoint
ALTER TABLE `__new_team_invitation` RENAME TO `team_invitation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `team_invitation_token_unique` ON `team_invitation` (`token`);--> statement-breakpoint
CREATE INDEX `ti_team_idx` ON `team_invitation` (`teamId`);--> statement-breakpoint
CREATE INDEX `ti_token_idx` ON `team_invitation` (`token`);--> statement-breakpoint
CREATE TABLE `__new_team_membership` (
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
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_team_membership`("createdAt", "updatedAt", "updateCounter", "id", "teamId", "userId", "roleId", "isSystemRole", "invitedBy", "joinedAt", "isActive") SELECT "createdAt", "updatedAt", "updateCounter", "id", "teamId", "userId", "roleId", "isSystemRole", "invitedBy", "joinedAt", "isActive" FROM `team_membership`;--> statement-breakpoint
DROP TABLE `team_membership`;--> statement-breakpoint
ALTER TABLE `__new_team_membership` RENAME TO `team_membership`;--> statement-breakpoint
CREATE INDEX `tm_team_idx` ON `team_membership` (`teamId`);--> statement-breakpoint
CREATE INDEX `tm_user_idx` ON `team_membership` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tm_team_user_unique` ON `team_membership` (`teamId`,`userId`);