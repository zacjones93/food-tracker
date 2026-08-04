CREATE TABLE `notification_push_devices` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`platform` text(20) DEFAULT 'ios' NOT NULL,
	`installationId` text(64) NOT NULL,
	`token` text(1024) NOT NULL,
	`environment` text(20) NOT NULL,
	`bundleId` text(255) NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`lastSeenAt` integer NOT NULL,
	`disabledAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_devices_user_enabled_idx` ON `notification_push_devices` (`userId`,`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_installation_unique` ON `notification_push_devices` (`bundleId`,`environment`,`installationId`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_token_unique` ON `notification_push_devices` (`bundleId`,`environment`,`token`);