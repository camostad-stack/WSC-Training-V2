CREATE TABLE `training_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`scenarioId` varchar(64) NOT NULL,
	`employeeRole` varchar(128) NOT NULL,
	`difficulty` int NOT NULL,
	`mode` varchar(32) NOT NULL,
	`scenarioJson` json NOT NULL,
	`transcript` json,
	`evaluationJson` json,
	`coachingJson` json,
	`overallScore` int,
	`competencyLevel` varchar(32),
	`status` enum('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `training_sessions_id` PRIMARY KEY(`id`)
);
