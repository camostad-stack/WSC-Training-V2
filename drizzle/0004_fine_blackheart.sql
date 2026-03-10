ALTER TABLE `manager_reviews` ADD `assignedNextDrillTemplateId` int;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_difficulty_min_chk` CHECK (`assignments`.`difficultyMin` between 1 and 5);--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_difficulty_max_chk` CHECK (`assignments`.`difficultyMax` between 1 and 5);--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_difficulty_range_chk` CHECK (`assignments`.`difficultyMin` <= `assignments`.`difficultyMax`);--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_required_attempts_chk` CHECK (`assignments`.`requiredAttempts` >= 1);--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_completed_attempts_chk` CHECK (`assignments`.`completedAttempts` >= 0);--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD CONSTRAINT `employee_profiles_total_sessions_chk` CHECK (`employee_profiles`.`totalSessions` >= 0);--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD CONSTRAINT `employee_profiles_average_score_chk` CHECK (`employee_profiles`.`averageScore` is null or `employee_profiles`.`averageScore` between 0 and 100);--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD CONSTRAINT `employee_profiles_consistency_score_chk` CHECK (`employee_profiles`.`consistencyScore` is null or `employee_profiles`.`consistencyScore` between 0 and 100);--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_original_score_chk` CHECK (`manager_reviews`.`originalScore` is null or `manager_reviews`.`originalScore` between 0 and 100);--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_override_score_chk` CHECK (`manager_reviews`.`overrideScore` is null or `manager_reviews`.`overrideScore` between 0 and 100);--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_score_delta_chk` CHECK (`manager_reviews`.`scoreDelta` is null or `manager_reviews`.`scoreDelta` between -100 and 100);--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_override_reason_chk` CHECK (`manager_reviews`.`overrideScore` is null or char_length(trim(`manager_reviews`.`overrideReason`)) > 0);--> statement-breakpoint
ALTER TABLE `policy_documents` ADD CONSTRAINT `policy_documents_version_chk` CHECK (`policy_documents`.`version` >= 1);--> statement-breakpoint
ALTER TABLE `scenario_templates` ADD CONSTRAINT `scenario_templates_difficulty_chk` CHECK (`scenario_templates`.`difficulty` between 1 and 5);--> statement-breakpoint
ALTER TABLE `scenario_templates` ADD CONSTRAINT `scenario_templates_turns_chk` CHECK (`scenario_templates`.`recommendedTurns` between 3 and 5);--> statement-breakpoint
ALTER TABLE `session_media` ADD CONSTRAINT `session_media_size_chk` CHECK (`session_media`.`fileSizeBytes` is null or `session_media`.`fileSizeBytes` >= 0);--> statement-breakpoint
ALTER TABLE `session_media` ADD CONSTRAINT `session_media_duration_chk` CHECK (`session_media`.`durationSeconds` is null or `session_media`.`durationSeconds` >= 0);--> statement-breakpoint
ALTER TABLE `session_media` ADD CONSTRAINT `session_media_turn_chk` CHECK (`session_media`.`turnNumber` is null or `session_media`.`turnNumber` >= 1);--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_difficulty_chk` CHECK (`simulation_sessions`.`difficulty` between 1 and 5);--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_turn_count_chk` CHECK (`simulation_sessions`.`turnCount` >= 0);--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_overall_score_chk` CHECK (`simulation_sessions`.`overallScore` is null or `simulation_sessions`.`overallScore` between 0 and 100);--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_employeeId_users_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_scenarioTemplateId_scenario_templates_id_fk` FOREIGN KEY (`scenarioTemplateId`) REFERENCES `scenario_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD CONSTRAINT `employee_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_sessionId_simulation_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `simulation_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_reviewerId_users_id_fk` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_employeeId_users_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `manager_reviews` ADD CONSTRAINT `manager_reviews_assignedNextDrillTemplateId_scenario_templates_id_fk` FOREIGN KEY (`assignedNextDrillTemplateId`) REFERENCES `scenario_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policy_documents` ADD CONSTRAINT `policy_documents_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scenario_templates` ADD CONSTRAINT `scenario_templates_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_media` ADD CONSTRAINT `session_media_sessionId_simulation_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `simulation_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_media` ADD CONSTRAINT `session_media_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_scenarioTemplateId_scenario_templates_id_fk` FOREIGN KEY (`scenarioTemplateId`) REFERENCES `scenario_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD CONSTRAINT `simulation_sessions_assignmentId_assignments_id_fk` FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_managerId_users_id_fk` FOREIGN KEY (`managerId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assignments_employee_status_idx` ON `assignments` (`employeeId`,`status`);--> statement-breakpoint
CREATE INDEX `assignments_assigned_by_idx` ON `assignments` (`assignedBy`);--> statement-breakpoint
CREATE INDEX `assignments_due_date_idx` ON `assignments` (`dueDate`);--> statement-breakpoint
CREATE INDEX `assignments_template_idx` ON `assignments` (`scenarioTemplateId`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_created_idx` ON `audit_logs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `employee_profiles_readiness_idx` ON `employee_profiles` (`readinessStatus`);--> statement-breakpoint
CREATE INDEX `employee_profiles_attention_idx` ON `employee_profiles` (`managerAttentionFlag`);--> statement-breakpoint
CREATE INDEX `manager_reviews_session_idx` ON `manager_reviews` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `manager_reviews_reviewer_idx` ON `manager_reviews` (`reviewerId`);--> statement-breakpoint
CREATE INDEX `manager_reviews_employee_idx` ON `manager_reviews` (`employeeId`);--> statement-breakpoint
CREATE INDEX `manager_reviews_status_idx` ON `manager_reviews` (`status`);--> statement-breakpoint
CREATE INDEX `policy_documents_department_active_idx` ON `policy_documents` (`department`,`isActive`);--> statement-breakpoint
CREATE INDEX `policy_documents_updated_idx` ON `policy_documents` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `scenario_templates_lookup_idx` ON `scenario_templates` (`department`,`scenarioFamily`,`isActive`);--> statement-breakpoint
CREATE INDEX `scenario_templates_difficulty_idx` ON `scenario_templates` (`difficulty`);--> statement-breakpoint
CREATE INDEX `session_media_session_idx` ON `session_media` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `session_media_user_idx` ON `session_media` (`userId`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_user_created_idx` ON `simulation_sessions` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_scenario_id_idx` ON `simulation_sessions` (`scenarioId`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_review_idx` ON `simulation_sessions` (`reviewStatus`,`status`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_assignment_idx` ON `simulation_sessions` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_template_idx` ON `simulation_sessions` (`scenarioTemplateId`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_department_family_idx` ON `simulation_sessions` (`department`,`scenarioFamily`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_completed_idx` ON `simulation_sessions` (`completedAt`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_department_idx` ON `users` (`department`);--> statement-breakpoint
CREATE INDEX `users_manager_idx` ON `users` (`managerId`);--> statement-breakpoint
CREATE INDEX `users_active_idx` ON `users` (`isActive`);--> statement-breakpoint
CREATE INDEX `users_last_signed_in_idx` ON `users` (`lastSignedIn`);