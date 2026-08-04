CREATE TABLE `team_entitlement_snapshot` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`source` text(50) NOT NULL,
	`sourceId` text(255) NOT NULL,
	`planKey` text(100) NOT NULL,
	`planVersion` integer NOT NULL,
	`features` text NOT NULL,
	`grantedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tent_team_idx` ON `team_entitlement_snapshot` (`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tent_source_unique` ON `team_entitlement_snapshot` (`source`,`sourceId`);--> statement-breakpoint
CREATE TABLE `team_feature_usage` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`feature` text(100) NOT NULL,
	`usageCount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tfu_team_feature_unique` ON `team_feature_usage` (`teamId`,`feature`);--> statement-breakpoint
INSERT INTO `team_feature_usage` (`createdAt`, `updatedAt`, `id`, `teamId`, `feature`, `usageCount`)
SELECT strftime('%s', 'now'), strftime('%s', 'now'), 'tfu_' || lower(hex(randomblob(16))), `team`.`id`, 'week_creations', count(`weeks`.`id`)
FROM `team`
LEFT JOIN `weeks` ON `weeks`.`teamId` = `team`.`id`
GROUP BY `team`.`id`;--> statement-breakpoint
CREATE TABLE `team_subscription` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`stripeCustomerId` text(255) NOT NULL,
	`stripeSubscriptionId` text(255),
	`entitlementSnapshotId` text,
	`status` text(50) DEFAULT 'none' NOT NULL,
	`priceId` text(255),
	`currentPeriodStart` integer,
	`currentPeriodEnd` integer,
	`cancelAtPeriodEnd` integer DEFAULT false NOT NULL,
	`paymentMethod` text,
	`lastSyncedAt` integer,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entitlementSnapshotId`) REFERENCES `team_entitlement_snapshot`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_subscription_teamId_unique` ON `team_subscription` (`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tsub_customer_unique` ON `team_subscription` (`stripeCustomerId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tsub_subscription_unique` ON `team_subscription` (`stripeSubscriptionId`);
