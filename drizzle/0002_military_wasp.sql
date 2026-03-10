CREATE TABLE `employee_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`levelEstimate` varchar(32),
	`readinessStatus` varchar(64),
	`trend` varchar(32),
	`skillMap` json,
	`strongestFamilies` json,
	`weakestFamilies` json,
	`pressureHandling` varchar(64),
	`consistencyScore` int,
	`totalSessions` int NOT NULL DEFAULT 0,
	`managerAttentionFlag` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `training_sessions` MODIFY COLUMN `status` enum('in_progress','completed','abandoned','invalid') NOT NULL DEFAULT 'in_progress';--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `scenarioFamily` varchar(64);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `stateHistory` json;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `policyGrounding` json;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `managerDebrief` json;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `sessionQuality` varchar(32);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `passFail` varchar(32);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `readinessSignal` varchar(64);