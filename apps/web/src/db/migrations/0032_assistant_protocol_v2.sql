CREATE TABLE `ai_runs` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`chatId` text NOT NULL,
	`userId` text NOT NULL,
	`teamId` text NOT NULL,
	`model` text(150) NOT NULL,
	`promptVersion` text(100) NOT NULL,
	`status` text(30) NOT NULL,
	`finishReason` text(50),
	`errorCode` text(100),
	`usageJson` text,
	FOREIGN KEY (`chatId`) REFERENCES `ai_chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_runs_chat_idx` ON `ai_runs` (`chatId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ai_runs_team_idx` ON `ai_runs` (`teamId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `ai_tool_executions` (
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updateCounter` integer DEFAULT 0,
	`id` text PRIMARY KEY NOT NULL,
	`runId` text NOT NULL,
	`namespace` text(100) NOT NULL,
	`toolName` text(150) NOT NULL,
	`status` text(30) NOT NULL,
	`inputSummaryJson` text,
	`outputSummaryJson` text,
	`durationMs` integer NOT NULL,
	`approvalState` text(30) DEFAULT 'not-required' NOT NULL,
	`writeOccurred` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`runId`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_tool_executions_run_idx` ON `ai_tool_executions` (`runId`);--> statement-breakpoint
CREATE INDEX `ai_tool_executions_tool_idx` ON `ai_tool_executions` (`namespace`,`toolName`);--> statement-breakpoint
ALTER TABLE `ai_message_parts` ADD `partType` text(100);--> statement-breakpoint
ALTER TABLE `ai_message_parts` ADD `payloadJson` text;