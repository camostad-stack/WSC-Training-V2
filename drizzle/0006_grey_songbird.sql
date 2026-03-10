ALTER TABLE `simulation_sessions` MODIFY COLUMN `mode` enum('in_person','phone','async_video','live_voice') NOT NULL DEFAULT 'in_person';--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `turnEvents` json;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `timingMarkers` json;