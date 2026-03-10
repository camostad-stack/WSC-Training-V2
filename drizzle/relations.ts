import { relations } from "drizzle-orm";
import {
  assignments,
  auditLogs,
  employeeProfiles,
  managerReviews,
  policyDocuments,
  scenarioTemplates,
  sessionMedia,
  simulationSessions,
  users,
} from "./schema";

export const usersRelations = relations(users, ({ many, one }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager_reports",
  }),
  directReports: many(users, { relationName: "manager_reports" }),
  profile: one(employeeProfiles, {
    fields: [users.id],
    references: [employeeProfiles.userId],
  }),
  sessions: many(simulationSessions),
  sessionMedia: many(sessionMedia),
  reviewsGiven: many(managerReviews, { relationName: "reviewer_reviews" }),
  reviewsReceived: many(managerReviews, { relationName: "employee_reviews" }),
  assignmentsOwned: many(assignments, { relationName: "employee_assignments" }),
  assignmentsCreated: many(assignments, { relationName: "manager_assignments" }),
  policiesUploaded: many(policyDocuments),
}));

export const employeeProfilesRelations = relations(employeeProfiles, ({ one }) => ({
  user: one(users, {
    fields: [employeeProfiles.userId],
    references: [users.id],
  }),
}));

export const scenarioTemplatesRelations = relations(scenarioTemplates, ({ many, one }) => ({
  createdByUser: one(users, {
    fields: [scenarioTemplates.createdBy],
    references: [users.id],
  }),
  assignments: many(assignments),
  sessions: many(simulationSessions),
  reviewFollowUps: many(managerReviews),
}));

export const assignmentsRelations = relations(assignments, ({ many, one }) => ({
  employee: one(users, {
    fields: [assignments.employeeId],
    references: [users.id],
    relationName: "employee_assignments",
  }),
  assignedByUser: one(users, {
    fields: [assignments.assignedBy],
    references: [users.id],
    relationName: "manager_assignments",
  }),
  scenarioTemplate: one(scenarioTemplates, {
    fields: [assignments.scenarioTemplateId],
    references: [scenarioTemplates.id],
  }),
  sessions: many(simulationSessions),
}));

export const simulationSessionsRelations = relations(simulationSessions, ({ many, one }) => ({
  user: one(users, {
    fields: [simulationSessions.userId],
    references: [users.id],
  }),
  scenarioTemplate: one(scenarioTemplates, {
    fields: [simulationSessions.scenarioTemplateId],
    references: [scenarioTemplates.id],
  }),
  assignment: one(assignments, {
    fields: [simulationSessions.assignmentId],
    references: [assignments.id],
  }),
  media: many(sessionMedia),
  reviews: many(managerReviews),
}));

export const sessionMediaRelations = relations(sessionMedia, ({ one }) => ({
  session: one(simulationSessions, {
    fields: [sessionMedia.sessionId],
    references: [simulationSessions.id],
  }),
  user: one(users, {
    fields: [sessionMedia.userId],
    references: [users.id],
  }),
}));

export const managerReviewsRelations = relations(managerReviews, ({ one }) => ({
  session: one(simulationSessions, {
    fields: [managerReviews.sessionId],
    references: [simulationSessions.id],
  }),
  reviewer: one(users, {
    fields: [managerReviews.reviewerId],
    references: [users.id],
    relationName: "reviewer_reviews",
  }),
  employee: one(users, {
    fields: [managerReviews.employeeId],
    references: [users.id],
    relationName: "employee_reviews",
  }),
  nextDrillTemplate: one(scenarioTemplates, {
    fields: [managerReviews.assignedNextDrillTemplateId],
    references: [scenarioTemplates.id],
  }),
}));

export const policyDocumentsRelations = relations(policyDocuments, ({ one }) => ({
  uploadedByUser: one(users, {
    fields: [policyDocuments.uploadedBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
