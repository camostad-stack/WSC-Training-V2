import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const USER_ROLES = ["employee", "shift_lead", "manager", "admin", "super_admin"] as const;
export const READINESS_STATUSES = ["not_ready", "practice_more", "shadow_ready", "partially_independent", "independent"] as const;
export const SESSION_MODES = ["in_person", "phone", "async_video", "live_voice"] as const;
export const SESSION_STATUSES = ["pending", "in_progress", "completed", "abandoned", "invalid", "reprocess"] as const;
export const REVIEW_STATUSES = ["pending", "reviewed", "overridden", "flagged"] as const;
export const EMOTIONAL_INTENSITIES = ["low", "moderate", "high"] as const;
export const SCENARIO_COMPLEXITIES = ["simple", "mixed", "ambiguous"] as const;
export const DEPARTMENTS = ["customer_service", "golf", "mod_emergency"] as const;
export const PASS_FAIL = ["pass", "borderline", "fail"] as const;
export const TRENDS = ["improving", "flat", "declining"] as const;
export const PERFORMANCE_SIGNALS = ["green", "yellow", "red"] as const;
export const SESSION_QUALITY_VALUES = ["usable", "questionable", "invalid"] as const;
export const ASSIGNMENT_STATUSES = ["assigned", "in_progress", "completed", "overdue", "cancelled"] as const;
export const SESSION_MEDIA_TYPES = ["video", "audio", "transcript_file"] as const;
export const AUDIT_ACTIONS = [
  "score_override", "scenario_create", "scenario_edit", "scenario_toggle",
  "policy_upload", "policy_activate", "assignment_create", "assignment_edit",
  "manager_review", "role_change", "profile_update",
] as const;

export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const readinessStatusEnum = pgEnum("readiness_status", READINESS_STATUSES);
export const sessionModeEnum = pgEnum("session_mode", SESSION_MODES);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const reviewStatusEnum = pgEnum("review_status", REVIEW_STATUSES);
export const emotionalIntensityEnum = pgEnum("emotional_intensity", EMOTIONAL_INTENSITIES);
export const scenarioComplexityEnum = pgEnum("scenario_complexity", SCENARIO_COMPLEXITIES);
export const departmentEnum = pgEnum("department", DEPARTMENTS);
export const passFailEnum = pgEnum("pass_fail", PASS_FAIL);
export const trendEnum = pgEnum("trend", TRENDS);
export const performanceSignalEnum = pgEnum("performance_signal", PERFORMANCE_SIGNALS);
export const sessionQualityEnum = pgEnum("session_quality", SESSION_QUALITY_VALUES);
export const assignmentStatusEnum = pgEnum("assignment_status", ASSIGNMENT_STATUSES);
export const sessionMediaTypeEnum = pgEnum("session_media_type", SESSION_MEDIA_TYPES);
export const auditActionEnum = pgEnum("audit_action", AUDIT_ACTIONS);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("employee").notNull(),
  department: departmentEnum("department"),
  managerId: integer("managerId").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_department_idx").on(table.department),
  index("users_manager_idx").on(table.managerId),
  index("users_active_idx").on(table.isActive),
  index("users_last_signed_in_idx").on(table.lastSignedIn),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const employeeProfiles = pgTable("employee_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  levelEstimate: varchar("levelEstimate", { length: 32 }),
  readinessStatus: readinessStatusEnum("readinessStatus").default("not_ready").notNull(),
  trend: trendEnum("trend").default("flat"),
  skillMap: jsonb("skillMap").$type<{
    empathy: number;
    clarity: number;
    policy_accuracy: number;
    ownership: number;
    de_escalation: number;
    escalation_judgment: number;
    professional_presence: number;
  }>(),
  strongestFamilies: jsonb("strongestFamilies").$type<string[]>(),
  weakestFamilies: jsonb("weakestFamilies").$type<string[]>(),
  pressureHandling: varchar("pressureHandling", { length: 64 }),
  consistencyScore: integer("consistencyScore"),
  totalSessions: integer("totalSessions").default(0).notNull(),
  averageScore: integer("averageScore"),
  managerAttentionFlag: boolean("managerAttentionFlag").default(false).notNull(),
  managerNotes: text("managerNotes"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("employee_profiles_readiness_idx").on(table.readinessStatus),
  index("employee_profiles_attention_idx").on(table.managerAttentionFlag),
  check("employee_profiles_total_sessions_chk", sql`${table.totalSessions} >= 0`),
  check("employee_profiles_average_score_chk", sql`${table.averageScore} is null or ${table.averageScore} between 0 and 100`),
  check("employee_profiles_consistency_score_chk", sql`${table.consistencyScore} is null or ${table.consistencyScore} between 0 and 100`),
]);

export type EmployeeProfile = typeof employeeProfiles.$inferSelect;
export type InsertEmployeeProfile = typeof employeeProfiles.$inferInsert;

export const scenarioTemplates = pgTable("scenario_templates", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  department: departmentEnum("department").notNull(),
  scenarioFamily: varchar("scenarioFamily", { length: 128 }).notNull(),
  targetRole: varchar("targetRole", { length: 128 }).notNull(),
  difficulty: integer("difficulty").notNull(),
  emotionalIntensity: emotionalIntensityEnum("emotionalIntensity").default("moderate").notNull(),
  complexity: scenarioComplexityEnum("complexity").default("mixed").notNull(),
  customerPersona: jsonb("customerPersona").$type<{
    name: string;
    age_band: string;
    membership_context: string;
    communication_style: string;
    initial_emotion: string;
    patience_level: string;
  }>().notNull(),
  situationSummary: text("situationSummary").notNull(),
  openingLine: text("openingLine").notNull(),
  hiddenFacts: jsonb("hiddenFacts").$type<string[]>(),
  approvedResolutionPaths: jsonb("approvedResolutionPaths").$type<string[]>(),
  requiredBehaviors: jsonb("requiredBehaviors").$type<string[]>(),
  criticalErrors: jsonb("criticalErrors").$type<string[]>(),
  branchLogic: jsonb("branchLogic"),
  emotionProgression: jsonb("emotionProgression"),
  completionRules: jsonb("completionRules"),
  recommendedTurns: integer("recommendedTurns").default(4).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("scenario_templates_lookup_idx").on(table.department, table.scenarioFamily, table.isActive),
  index("scenario_templates_difficulty_idx").on(table.difficulty),
  check("scenario_templates_difficulty_chk", sql`${table.difficulty} between 1 and 5`),
  check("scenario_templates_turns_chk", sql`${table.recommendedTurns} between 3 and 5`),
]);

export type ScenarioTemplate = typeof scenarioTemplates.$inferSelect;
export type InsertScenarioTemplate = typeof scenarioTemplates.$inferInsert;

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employeeId").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedBy: integer("assignedBy").notNull().references(() => users.id),
  scenarioTemplateId: integer("scenarioTemplateId").references(() => scenarioTemplates.id, { onDelete: "set null" }),
  scenarioFamily: varchar("scenarioFamily", { length: 128 }),
  department: departmentEnum("department"),
  difficultyMin: integer("difficultyMin").default(1).notNull(),
  difficultyMax: integer("difficultyMax").default(5).notNull(),
  requiredAttempts: integer("requiredAttempts").default(1).notNull(),
  completedAttempts: integer("completedAttempts").default(0).notNull(),
  status: assignmentStatusEnum("status").default("assigned").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  notes: text("notes"),
  dueDate: timestamp("dueDate", { withTimezone: true }),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("assignments_employee_status_idx").on(table.employeeId, table.status),
  index("assignments_assigned_by_idx").on(table.assignedBy),
  index("assignments_due_date_idx").on(table.dueDate),
  index("assignments_template_idx").on(table.scenarioTemplateId),
  check("assignments_difficulty_min_chk", sql`${table.difficultyMin} between 1 and 5`),
  check("assignments_difficulty_max_chk", sql`${table.difficultyMax} between 1 and 5`),
  check("assignments_difficulty_range_chk", sql`${table.difficultyMin} <= ${table.difficultyMax}`),
  check("assignments_required_attempts_chk", sql`${table.requiredAttempts} >= 1`),
  check("assignments_completed_attempts_chk", sql`${table.completedAttempts} >= 0`),
]);

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;

export const simulationSessions = pgTable("simulation_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  scenarioTemplateId: integer("scenarioTemplateId").references(() => scenarioTemplates.id, { onDelete: "set null" }),
  assignmentId: integer("assignmentId").references(() => assignments.id, { onDelete: "set null" }),
  scenarioId: varchar("scenarioId", { length: 64 }).notNull(),
  department: departmentEnum("department"),
  scenarioFamily: varchar("scenarioFamily", { length: 128 }),
  employeeRole: varchar("employeeRole", { length: 128 }).notNull(),
  difficulty: integer("difficulty").notNull(),
  mode: sessionModeEnum("mode").default("in_person").notNull(),
  status: sessionStatusEnum("status").default("pending").notNull(),
  scenarioJson: jsonb("scenarioJson").notNull(),
  transcript: jsonb("transcript").$type<Array<{
    role: "customer" | "employee";
    message: string;
    emotion?: string;
    timestamp?: number;
  }>>(),
  turnEvents: jsonb("turnEvents").$type<Array<{
    type: string;
    source: "system" | "employee" | "customer";
    atMs: number;
    payload?: Record<string, unknown>;
  }>>(),
  timingMarkers: jsonb("timingMarkers").$type<Array<{
    name: string;
    atMs: number;
    detail?: string;
  }>>(),
  stateHistory: jsonb("stateHistory").$type<Array<{
    turn_number: number;
    emotion_state: string;
    trust_level: number;
    issue_clarity: number;
    employee_flags: Record<string, boolean>;
    escalation_required: boolean;
    scenario_risk_level: string;
  }>>(),
  turnCount: integer("turnCount").default(0).notNull(),
  policyGrounding: jsonb("policyGrounding"),
  visibleBehavior: jsonb("visibleBehavior"),
  evaluationResult: jsonb("evaluationResult"),
  coachingResult: jsonb("coachingResult"),
  managerDebrief: jsonb("managerDebrief"),
  sessionQuality: sessionQualityEnum("sessionQuality"),
  lowEffortResult: jsonb("lowEffortResult"),
  overallScore: integer("overallScore"),
  passFail: passFailEnum("passFail"),
  readinessSignal: readinessStatusEnum("readinessSignal"),
  categoryScores: jsonb("categoryScores").$type<{
    opening_warmth: number;
    listening_empathy: number;
    clarity_directness: number;
    policy_accuracy: number;
    ownership: number;
    problem_solving: number;
    de_escalation: number;
    escalation_judgment: number;
    visible_professionalism: number;
    closing_control: number;
  }>(),
  reviewStatus: reviewStatusEnum("reviewStatus").default("pending").notNull(),
  isFlagged: boolean("isFlagged").default(false).notNull(),
  flagReason: text("flagReason"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("simulation_sessions_user_created_idx").on(table.userId, table.createdAt),
  index("simulation_sessions_scenario_id_idx").on(table.scenarioId),
  index("simulation_sessions_review_idx").on(table.reviewStatus, table.status),
  index("simulation_sessions_assignment_idx").on(table.assignmentId),
  index("simulation_sessions_template_idx").on(table.scenarioTemplateId),
  index("simulation_sessions_department_family_idx").on(table.department, table.scenarioFamily),
  index("simulation_sessions_completed_idx").on(table.completedAt),
  check("simulation_sessions_difficulty_chk", sql`${table.difficulty} between 1 and 5`),
  check("simulation_sessions_turn_count_chk", sql`${table.turnCount} >= 0`),
  check("simulation_sessions_overall_score_chk", sql`${table.overallScore} is null or ${table.overallScore} between 0 and 100`),
]);

export type SimulationSession = typeof simulationSessions.$inferSelect;
export type InsertSimulationSession = typeof simulationSessions.$inferInsert;

export const sessionMedia = pgTable("session_media", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().references(() => simulationSessions.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  mediaType: sessionMediaTypeEnum("mediaType").notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSizeBytes: integer("fileSizeBytes"),
  durationSeconds: integer("durationSeconds"),
  turnNumber: integer("turnNumber"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("session_media_session_idx").on(table.sessionId, table.createdAt),
  index("session_media_user_idx").on(table.userId),
  check("session_media_size_chk", sql`${table.fileSizeBytes} is null or ${table.fileSizeBytes} >= 0`),
  check("session_media_duration_chk", sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`),
  check("session_media_turn_chk", sql`${table.turnNumber} is null or ${table.turnNumber} >= 1`),
]);

export type SessionMedia = typeof sessionMedia.$inferSelect;
export type InsertSessionMedia = typeof sessionMedia.$inferInsert;

export const managerReviews = pgTable("manager_reviews", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().references(() => simulationSessions.id, { onDelete: "cascade" }),
  reviewerId: integer("reviewerId").notNull().references(() => users.id),
  employeeId: integer("employeeId").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalScore: integer("originalScore"),
  overrideScore: integer("overrideScore"),
  scoreDelta: integer("scoreDelta"),
  overrideReason: text("overrideReason"),
  managerNotes: text("managerNotes"),
  performanceSignal: performanceSignalEnum("performanceSignal"),
  followUpRequired: boolean("followUpRequired").default(false).notNull(),
  followUpAction: text("followUpAction"),
  shadowingNeeded: boolean("shadowingNeeded").default(false).notNull(),
  assignedNextDrillTemplateId: integer("assignedNextDrillTemplateId").references(() => scenarioTemplates.id, { onDelete: "set null" }),
  assignedNextDrill: varchar("assignedNextDrill", { length: 256 }),
  status: reviewStatusEnum("status").default("reviewed").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("manager_reviews_session_idx").on(table.sessionId, table.createdAt),
  index("manager_reviews_reviewer_idx").on(table.reviewerId),
  index("manager_reviews_employee_idx").on(table.employeeId),
  index("manager_reviews_status_idx").on(table.status),
  check("manager_reviews_original_score_chk", sql`${table.originalScore} is null or ${table.originalScore} between 0 and 100`),
  check("manager_reviews_override_score_chk", sql`${table.overrideScore} is null or ${table.overrideScore} between 0 and 100`),
  check("manager_reviews_score_delta_chk", sql`${table.scoreDelta} is null or ${table.scoreDelta} between -100 and 100`),
  check("manager_reviews_override_reason_chk", sql`${table.overrideScore} is null or char_length(trim(${table.overrideReason})) > 0`),
]);

export type ManagerReview = typeof managerReviews.$inferSelect;
export type InsertManagerReview = typeof managerReviews.$inferInsert;

export const policyDocuments = pgTable("policy_documents", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  department: departmentEnum("department"),
  scenarioFamilies: jsonb("scenarioFamilies").$type<string[]>(),
  content: text("content").notNull(),
  version: integer("version").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  uploadedBy: integer("uploadedBy").references(() => users.id, { onDelete: "set null" }),
  storageUrl: varchar("storageUrl", { length: 1024 }),
  storageKey: varchar("storageKey", { length: 512 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("policy_documents_department_active_idx").on(table.department, table.isActive),
  index("policy_documents_updated_idx").on(table.updatedAt),
  check("policy_documents_version_chk", sql`${table.version} >= 1`),
]);

export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type InsertPolicyDocument = typeof policyDocuments.$inferInsert;

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  action: auditActionEnum("action").notNull(),
  targetType: varchar("targetType", { length: 64 }).notNull(),
  targetId: integer("targetId"),
  details: jsonb("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_logs_user_created_idx").on(table.userId, table.createdAt),
  index("audit_logs_action_idx").on(table.action),
  index("audit_logs_target_idx").on(table.targetType, table.targetId),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
