CREATE TABLE `apple_server_notification_event` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`notificationUuid` text(36) NOT NULL,
	`notificationType` text(100),
	`subtype` text(100),
	`signedAt` integer,
	`originalTransactionId` text(255),
	`status` text(20) DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`error` text(1000),
	`processedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apple_server_notification_event_notificationUuid_unique` ON `apple_server_notification_event` (`notificationUuid`);--> statement-breakpoint
CREATE INDEX `asne_status_idx` ON `apple_server_notification_event` (`status`);--> statement-breakpoint
CREATE TABLE `apple_subscription_binding` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`appAccountToken` text(36) NOT NULL,
	`originalTransactionId` text(255),
	`entitlementSnapshotId` text,
	`environment` text(20),
	`bundleId` text(255),
	`productId` text(255),
	`status` text(50) DEFAULT 'none' NOT NULL,
	`autoRenewStatus` integer DEFAULT false NOT NULL,
	`purchaseDate` integer,
	`currentPeriodEnd` integer,
	`gracePeriodExpiresAt` integer,
	`revocationDate` integer,
	`lastTransactionId` text(255),
	`lastTransactionSignedAt` integer,
	`lastRenewalSignedAt` integer,
	`lastSyncedAt` integer,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entitlementSnapshotId`) REFERENCES `team_entitlement_snapshot`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apple_subscription_binding_teamId_unique` ON `apple_subscription_binding` (`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apple_subscription_binding_appAccountToken_unique` ON `apple_subscription_binding` (`appAccountToken`);--> statement-breakpoint
CREATE UNIQUE INDEX `asub_original_transaction_unique` ON `apple_subscription_binding` (`originalTransactionId`);