import { sql } from "drizzle-orm";
import {
  AnyMySqlColumn,
  boolean,
  check,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Reusable enum values shared by schema and API validation.
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

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", USER_ROLES).default("employee").notNull(),
  department: mysqlEnum("department", DEPARTMENTS),
  managerId: int("managerId").references((): AnyMySqlColumn => users.id, { onDelete: "set null" }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_department_idx").on(table.department),
  index("users_manager_idx").on(table.managerId),
  index("users_active_idx").on(table.isActive),
  index("users_last_signed_in_idx").on(table.lastSignedIn),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const employeeProfiles = mysqlTable("employee_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  levelEstimate: varchar("levelEstimate", { length: 32 }),
  readinessStatus: mysqlEnum("readinessStatus", READINESS_STATUSES).default("not_ready").notNull(),
  trend: mysqlEnum("trend", TRENDS).default("flat"),
  skillMap: json("skillMap").$type<{
    empathy: number;
    clarity: number;
    policy_accuracy: number;
    ownership: number;
    de_escalation: number;
    escalation_judgment: number;
    professional_presence: number;
  }>(),
  strongestFamilies: json("strongestFamilies").$type<string[]>(),
  weakestFamilies: json("weakestFamilies").$type<string[]>(),
  pressureHandling: varchar("pressureHandling", { length: 64 }),
  consistencyScore: int("consistencyScore"),
  totalSessions: int("totalSessions").default(0).notNull(),
  averageScore: int("averageScore"),
  managerAttentionFlag: boolean("managerAttentionFlag").default(false).notNull(),
  managerNotes: text("managerNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("employee_profiles_readiness_idx").on(table.readinessStatus),
  index("employee_profiles_attention_idx").on(table.managerAttentionFlag),
  check("employee_profiles_total_sessions_chk", sql`${table.totalSessions} >= 0`),
  check("employee_profiles_average_score_chk", sql`${table.averageScore} is null or ${table.averageScore} between 0 and 100`),
  check("employee_profiles_consistency_score_chk", sql`${table.consistencyScore} is null or ${table.consistencyScore} between 0 and 100`),
]);

export type EmployeeProfile = typeof employeeProfiles.$inferSelect;
export type InsertEmployeeProfile = typeof employeeProfiles.$inferInsert;

export const scenarioTemplates = mysqlTable("scenario_templates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  department: mysqlEnum("department", DEPARTMENTS).notNull(),
  scenarioFamily: varchar("scenarioFamily", { length: 128 }).notNull(),
  targetRole: varchar("targetRole", { length: 128 }).notNull(),
  difficulty: int("difficulty").notNull(),
  emotionalIntensity: mysqlEnum("emotionalIntensity", EMOTIONAL_INTENSITIES).default("moderate").notNull(),
  complexity: mysqlEnum("complexity", SCENARIO_COMPLEXITIES).default("mixed").notNull(),
  customerPersona: json("customerPersona").$type<{
    name: string;
    age_band: string;
    membership_context: string;
    communication_style: string;
    initial_emotion: string;
    patience_level: string;
  }>().notNull(),
  situationSummary: text("situationSummary").notNull(),
  openingLine: text("openingLine").notNull(),
  hiddenFacts: json("hiddenFacts").$type<string[]>(),
  approvedResolutionPaths: json("approvedResolutionPaths").$type<string[]>(),
  requiredBehaviors: json("requiredBehaviors").$type<string[]>(),
  criticalErrors: json("criticalErrors").$type<string[]>(),
  branchLogic: json("branchLogic"),
  emotionProgression: json("emotionProgression"),
  completionRules: json("completionRules"),
  recommendedTurns: int("recommendedTurns").default(4).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("scenario_templates_lookup_idx").on(table.department, table.scenarioFamily, table.isActive),
  index("scenario_templates_difficulty_idx").on(table.difficulty),
  check("scenario_templates_difficulty_chk", sql`${table.difficulty} between 1 and 5`),
  check("scenario_templates_turns_chk", sql`${table.recommendedTurns} between 3 and 5`),
]);

export type ScenarioTemplate = typeof scenarioTemplates.$inferSelect;
export type InsertScenarioTemplate = typeof scenarioTemplates.$inferInsert;

export const assignments = mysqlTable("assignments", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedBy: int("assignedBy").notNull().references(() => users.id),
  scenarioTemplateId: int("scenarioTemplateId").references(() => scenarioTemplates.id, { onDelete: "set null" }),
  scenarioFamily: varchar("scenarioFamily", { length: 128 }),
  department: mysqlEnum("department", DEPARTMENTS),
  difficultyMin: int("difficultyMin").default(1).notNull(),
  difficultyMax: int("difficultyMax").default(5).notNull(),
  requiredAttempts: int("requiredAttempts").default(1).notNull(),
  completedAttempts: int("completedAttempts").default(0).notNull(),
  status: mysqlEnum("status", ASSIGNMENT_STATUSES).default("assigned").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  notes: text("notes"),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export const simulationSessions = mysqlTable("simulation_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  scenarioTemplateId: int("scenarioTemplateId").references(() => scenarioTemplates.id, { onDelete: "set null" }),
  assignmentId: int("assignmentId").references(() => assignments.id, { onDelete: "set null" }),
  scenarioId: varchar("scenarioId", { length: 64 }).notNull(),
  department: mysqlEnum("department", DEPARTMENTS),
  scenarioFamily: varchar("scenarioFamily", { length: 128 }),
  employeeRole: varchar("employeeRole", { length: 128 }).notNull(),
  difficulty: int("difficulty").notNull(),
  mode: mysqlEnum("mode", SESSION_MODES).default("in_person").notNull(),
  status: mysqlEnum("status", SESSION_STATUSES).default("pending").notNull(),
  scenarioJson: json("scenarioJson").notNull(),
  transcript: json("transcript").$type<Array<{
    role: "customer" | "employee";
    message: string;
    emotion?: string;
    timestamp?: number;
  }>>(),
  turnEvents: json("turnEvents").$type<Array<{
    type: string;
    source: "system" | "employee" | "customer";
    atMs: number;
    payload?: Record<string, unknown>;
  }>>(),
  timingMarkers: json("timingMarkers").$type<Array<{
    name: string;
    atMs: number;
    detail?: string;
  }>>(),
  stateHistory: json("stateHistory").$type<Array<{
    turn_number: number;
    emotion_state: string;
    trust_level: number;
    issue_clarity: number;
    employee_flags: Record<string, boolean>;
    escalation_required: boolean;
    scenario_risk_level: string;
  }>>(),
  turnCount: int("turnCount").default(0).notNull(),
  policyGrounding: json("policyGrounding"),
  visibleBehavior: json("visibleBehavior"),
  evaluationResult: json("evaluationResult"),
  coachingResult: json("coachingResult"),
  managerDebrief: json("managerDebrief"),
  sessionQuality: mysqlEnum("sessionQuality", SESSION_QUALITY_VALUES),
  lowEffortResult: json("lowEffortResult"),
  overallScore: int("overallScore"),
  passFail: mysqlEnum("passFail", PASS_FAIL),
  readinessSignal: mysqlEnum("readinessSignal", READINESS_STATUSES),
  categoryScores: json("categoryScores").$type<{
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
  reviewStatus: mysqlEnum("reviewStatus", REVIEW_STATUSES).default("pending").notNull(),
  isFlagged: boolean("isFlagged").default(false).notNull(),
  flagReason: text("flagReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export const sessionMedia = mysqlTable("session_media", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => simulationSessions.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  mediaType: mysqlEnum("mediaType", SESSION_MEDIA_TYPES).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSizeBytes: int("fileSizeBytes"),
  durationSeconds: int("durationSeconds"),
  turnNumber: int("turnNumber"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("session_media_session_idx").on(table.sessionId, table.createdAt),
  index("session_media_user_idx").on(table.userId),
  check("session_media_size_chk", sql`${table.fileSizeBytes} is null or ${table.fileSizeBytes} >= 0`),
  check("session_media_duration_chk", sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`),
  check("session_media_turn_chk", sql`${table.turnNumber} is null or ${table.turnNumber} >= 1`),
]);

export type SessionMedia = typeof sessionMedia.$inferSelect;
export type InsertSessionMedia = typeof sessionMedia.$inferInsert;

export const managerReviews = mysqlTable("manager_reviews", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => simulationSessions.id, { onDelete: "cascade" }),
  reviewerId: int("reviewerId").notNull().references(() => users.id),
  employeeId: int("employeeId").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalScore: int("originalScore"),
  overrideScore: int("overrideScore"),
  scoreDelta: int("scoreDelta"),
  overrideReason: text("overrideReason"),
  managerNotes: text("managerNotes"),
  performanceSignal: mysqlEnum("performanceSignal", PERFORMANCE_SIGNALS),
  followUpRequired: boolean("followUpRequired").default(false).notNull(),
  followUpAction: text("followUpAction"),
  shadowingNeeded: boolean("shadowingNeeded").default(false).notNull(),
  assignedNextDrillTemplateId: int("assignedNextDrillTemplateId").references(() => scenarioTemplates.id, { onDelete: "set null" }),
  assignedNextDrill: varchar("assignedNextDrill", { length: 256 }),
  status: mysqlEnum("status", REVIEW_STATUSES).default("reviewed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export const policyDocuments = mysqlTable("policy_documents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  department: mysqlEnum("department", DEPARTMENTS),
  scenarioFamilies: json("scenarioFamilies").$type<string[]>(),
  content: text("content").notNull(),
  version: int("version").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  uploadedBy: int("uploadedBy").references(() => users.id, { onDelete: "set null" }),
  storageUrl: varchar("storageUrl", { length: 1024 }),
  storageKey: varchar("storageKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("policy_documents_department_active_idx").on(table.department, table.isActive),
  index("policy_documents_updated_idx").on(table.updatedAt),
  check("policy_documents_version_chk", sql`${table.version} >= 1`),
]);

export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type InsertPolicyDocument = typeof policyDocuments.$inferInsert;

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  action: mysqlEnum("action", AUDIT_ACTIONS).notNull(),
  targetType: varchar("targetType", { length: 64 }).notNull(),
  targetId: int("targetId"),
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("audit_logs_user_created_idx").on(table.userId, table.createdAt),
  index("audit_logs_action_idx").on(table.action),
  index("audit_logs_target_idx").on(table.targetType, table.targetId),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
