CREATE TABLE `assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`assignedBy` int NOT NULL,
	`scenarioTemplateId` int,
	`scenarioFamily` varchar(128),
	`department` enum('customer_service','golf','mod_emergency'),
	`difficultyMin` int NOT NULL DEFAULT 1,
	`difficultyMax` int NOT NULL DEFAULT 5,
	`requiredAttempts` int NOT NULL DEFAULT 1,
	`completedAttempts` int NOT NULL DEFAULT 0,
	`status` enum('assigned','in_progress','completed','overdue','cancelled') NOT NULL DEFAULT 'assigned',
	`title` varchar(256) NOT NULL,
	`notes` text,
	`dueDate` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` enum('score_override','scenario_create','scenario_edit','scenario_toggle','policy_upload','policy_activate','assignment_create','assignment_edit','manager_review','role_change','profile_update') NOT NULL,
	`targetType` varchar(64) NOT NULL,
	`targetId` int,
	`details` json,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manager_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`employeeId` int NOT NULL,
	`originalScore` int,
	`overrideScore` int,
	`scoreDelta` int,
	`overrideReason` text,
	`managerNotes` text,
	`performanceSignal` enum('green','yellow','red'),
	`followUpRequired` boolean NOT NULL DEFAULT false,
	`followUpAction` text,
	`shadowingNeeded` boolean NOT NULL DEFAULT false,
	`assignedNextDrill` varchar(256),
	`status` enum('pending','reviewed','overridden','flagged') NOT NULL DEFAULT 'reviewed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manager_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`department` enum('customer_service','golf','mod_emergency'),
	`scenarioFamilies` json,
	`content` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`uploadedBy` int,
	`storageUrl` varchar(1024),
	`storageKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `policy_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scenario_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`department` enum('customer_service','golf','mod_emergency') NOT NULL,
	`scenarioFamily` varchar(128) NOT NULL,
	`targetRole` varchar(128) NOT NULL,
	`difficulty` int NOT NULL,
	`emotionalIntensity` enum('low','moderate','high') NOT NULL DEFAULT 'moderate',
	`complexity` enum('simple','mixed','ambiguous') NOT NULL DEFAULT 'mixed',
	`customerPersona` json NOT NULL,
	`situationSummary` text NOT NULL,
	`openingLine` text NOT NULL,
	`hiddenFacts` json,
	`approvedResolutionPaths` json,
	`requiredBehaviors` json,
	`criticalErrors` json,
	`branchLogic` json,
	`emotionProgression` json,
	`completionRules` json,
	`recommendedTurns` int NOT NULL DEFAULT 4,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scenario_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`mediaType` enum('video','audio','transcript_file') NOT NULL,
	`storageUrl` varchar(1024) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(128),
	`fileSizeBytes` int,
	`durationSeconds` int,
	`turnNumber` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `simulation_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scenarioTemplateId` int,
	`assignmentId` int,
	`scenarioId` varchar(64) NOT NULL,
	`department` enum('customer_service','golf','mod_emergency'),
	`scenarioFamily` varchar(128),
	`employeeRole` varchar(128) NOT NULL,
	`difficulty` int NOT NULL,
	`mode` enum('in_person','phone','async_video') NOT NULL DEFAULT 'in_person',
	`status` enum('pending','in_progress','completed','abandoned','invalid','reprocess') NOT NULL DEFAULT 'pending',
	`scenarioJson` json NOT NULL,
	`transcript` json,
	`stateHistory` json,
	`turnCount` int NOT NULL DEFAULT 0,
	`policyGrounding` json,
	`visibleBehavior` json,
	`evaluationResult` json,
	`coachingResult` json,
	`managerDebrief` json,
	`sessionQuality` enum('usable','questionable','invalid'),
	`lowEffortResult` json,
	`overallScore` int,
	`passFail` enum('pass','borderline','fail'),
	`readinessSignal` enum('not_ready','practice_more','shadow_ready','partially_independent','independent'),
	`categoryScores` json,
	`reviewStatus` enum('pending','reviewed','overridden','flagged') NOT NULL DEFAULT 'pending',
	`isFlagged` boolean NOT NULL DEFAULT false,
	`flagReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `simulation_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `training_sessions`;--> statement-breakpoint
ALTER TABLE `employee_profiles` MODIFY COLUMN `readinessStatus` enum('not_ready','practice_more','shadow_ready','partially_independent','independent') NOT NULL DEFAULT 'not_ready';--> statement-breakpoint
ALTER TABLE `employee_profiles` MODIFY COLUMN `trend` enum('improving','flat','declining') DEFAULT 'flat';--> statement-breakpoint
ALTER TABLE `employee_profiles` MODIFY COLUMN `managerAttentionFlag` boolean NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_profiles` MODIFY COLUMN `managerAttentionFlag` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('employee','shift_lead','manager','admin','super_admin') NOT NULL DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD `averageScore` int;--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD `managerNotes` text;--> statement-breakpoint
ALTER TABLE `users` ADD `department` enum('customer_service','golf','mod_emergency');--> statement-breakpoint
ALTER TABLE `users` ADD `managerId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;