CREATE TABLE `notification_push_deliveries` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`pushDeviceId` text NOT NULL,
	`topic` text(100) NOT NULL,
	`dedupeKey` text(255) NOT NULL,
	`title` text(255) NOT NULL,
	`body` text(2048) NOT NULL,
	`destination` text(1000),
	`status` text(30) DEFAULT 'pending' NOT NULL,
	`apnsId` text(36) NOT NULL,
	`attemptCount` integer DEFAULT 0 NOT NULL,
	`leaseExpiresAt` integer,
	`lastAttemptAt` integer,
	`acceptedAt` integer,
	`failedAt` integer,
	`suppressedAt` integer,
	`providerMessageId` text(255),
	`providerCode` text(100),
	`lastError` text(1000),
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pushDeviceId`) REFERENCES `notification_push_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_deliveries_status_lease_idx` ON `notification_push_deliveries` (`status`,`leaseExpiresAt`);--> statement-breakpoint
CREATE INDEX `push_deliveries_team_user_idx` ON `notification_push_deliveries` (`teamId`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_deliveries_device_dedupe_unique` ON `notification_push_deliveries` (`pushDeviceId`,`dedupeKey`);--> statement-breakpoint
CREATE TABLE `notification_push_preferences` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`pushEnabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_preferences_team_user_unique` ON `notification_push_preferences` (`teamId`,`userId`);