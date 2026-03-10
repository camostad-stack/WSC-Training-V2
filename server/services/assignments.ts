import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { assignments } from "../../drizzle/schema";
import { getDb } from "../db";
import { logAudit } from "./audit-log";

export async function markAssignmentInProgress(employeeId: number, assignmentId: number) {
  const db = await getDb();
  if (!db) return { success: false, status: null };

  const rows = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  const assignment = rows[0];
  if (!assignment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
  }

  if (assignment.employeeId !== employeeId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Assignment access denied" });
  }

  if (assignment.status === "assigned") {
    await db.update(assignments).set({ status: "in_progress" }).where(eq(assignments.id, assignmentId));
    await logAudit(employeeId, "assignment_edit", "assignment", assignmentId, { status: "in_progress" });
    return { success: true, status: "in_progress" as const };
  }

  return { success: true, status: assignment.status };
}

export async function updateAssignmentCompletionIfNeeded(
  assignmentId: number | undefined,
  hasEvaluation: boolean,
) {
  if (!assignmentId || !hasEvaluation) return;

  const db = await getDb();
  if (!db) return;

  const assignmentRows = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  const assignment = assignmentRows[0];
  if (!assignment) return;

  const completedAttempts = assignment.completedAttempts + 1;
  await db.update(assignments).set({
    completedAttempts,
    status: completedAttempts >= assignment.requiredAttempts ? "completed" : "in_progress",
    completedAt: completedAttempts >= assignment.requiredAttempts ? new Date() : null,
  }).where(eq(assignments.id, assignmentId));
}
