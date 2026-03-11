import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { assignments, managerReviews, scenarioTemplates, simulationSessions } from "../../drizzle/schema";
import { assertManagerCanAccessSession, type ActorIdentity } from "./access-control";
import { logAudit } from "./audit-log";

export interface CreateManagerReviewInput {
  sessionId: number;
  employeeId: number;
  originalScore?: number;
  overrideScore?: number;
  overrideReason?: string;
  managerNotes?: string;
  performanceSignal?: "green" | "yellow" | "red";
  followUpRequired: boolean;
  followUpAction?: string;
  shadowingNeeded: boolean;
  assignedNextDrillTemplateId?: number;
  assignedNextDrill?: string;
}

function hasScoreOverride(originalScore?: number, overrideScore?: number) {
  if (overrideScore === undefined) return false;
  if (originalScore === undefined) return true;
  return overrideScore !== originalScore;
}

export async function createManagerReview(
  reviewer: ActorIdentity,
  input: CreateManagerReviewInput,
) {
  const { db, session } = await assertManagerCanAccessSession(reviewer, input.sessionId);
  if (!db) return { success: false };
  if (!session) return { success: false };

  if (session.userId !== input.employeeId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Session employee mismatch" });
  }

  const isOverride = hasScoreOverride(input.originalScore, input.overrideScore);
  const overrideReason = input.overrideReason?.trim();
  const scoreDelta = isOverride && input.overrideScore !== undefined && input.originalScore !== undefined
    ? input.overrideScore - input.originalScore
    : null;

  if (isOverride && !overrideReason) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Override reason is required when changing a score",
    });
  }

  let nextDrillTemplate:
    | { id: number; title: string; scenarioFamily: string; department: string | null; difficulty: number; isActive: boolean }
    | null = null;

  if (input.assignedNextDrillTemplateId !== undefined) {
    const templateRows = await db.select({
      id: scenarioTemplates.id,
      title: scenarioTemplates.title,
      scenarioFamily: scenarioTemplates.scenarioFamily,
      department: scenarioTemplates.department,
      difficulty: scenarioTemplates.difficulty,
      isActive: scenarioTemplates.isActive,
    })
      .from(scenarioTemplates)
      .where(eq(scenarioTemplates.id, input.assignedNextDrillTemplateId))
      .limit(1);

    nextDrillTemplate = templateRows[0] ?? null;
    if (!nextDrillTemplate) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Next drill template not found" });
    }
    if (!nextDrillTemplate.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Next drill template is inactive" });
    }
  }

  const assignedNextDrillFamily = nextDrillTemplate?.scenarioFamily ?? input.assignedNextDrill;

  const reviewValues: Record<string, unknown> = {
    sessionId: input.sessionId,
    reviewerId: reviewer.id,
    employeeId: input.employeeId,
    followUpRequired: input.followUpRequired,
    shadowingNeeded: input.shadowingNeeded,
    status: isOverride ? "overridden" : "reviewed",
  };

  if (input.originalScore !== undefined) reviewValues.originalScore = input.originalScore;
  if (isOverride && input.overrideScore !== undefined) reviewValues.overrideScore = input.overrideScore;
  if (scoreDelta !== null) reviewValues.scoreDelta = scoreDelta;
  if (overrideReason) reviewValues.overrideReason = overrideReason;
  if (input.managerNotes) reviewValues.managerNotes = input.managerNotes;
  if (input.performanceSignal) reviewValues.performanceSignal = input.performanceSignal;
  if (input.followUpAction) reviewValues.followUpAction = input.followUpAction;
  if (nextDrillTemplate?.id !== undefined) reviewValues.assignedNextDrillTemplateId = nextDrillTemplate.id;
  if (assignedNextDrillFamily) reviewValues.assignedNextDrill = assignedNextDrillFamily;

  await db.insert(managerReviews).values(reviewValues as any);

  const sessionUpdate: Record<string, unknown> = {
    reviewStatus: isOverride ? "overridden" : "reviewed",
  };
  if (isOverride && input.overrideScore !== undefined) sessionUpdate.overallScore = input.overrideScore;
  await db.update(simulationSessions).set(sessionUpdate).where(eq(simulationSessions.id, input.sessionId));

  if (isOverride) {
    await logAudit(reviewer.id, "score_override", "session", input.sessionId, {
      originalScore: input.originalScore,
      overrideScore: input.overrideScore,
      scoreDelta,
      reason: overrideReason,
    });
  } else {
    await logAudit(reviewer.id, "manager_review", "session", input.sessionId, {
      notes: input.managerNotes,
    });
  }

  if (assignedNextDrillFamily || nextDrillTemplate) {
    const nextDifficulty = nextDrillTemplate?.difficulty ?? session.difficulty ?? 1;
    const assignmentInsert = await db.insert(assignments).values({
      employeeId: session.userId,
      assignedBy: reviewer.id,
      scenarioTemplateId: nextDrillTemplate?.id,
      scenarioFamily: assignedNextDrillFamily,
      department: nextDrillTemplate?.department ?? session.department,
      difficultyMin: Math.max(1, Math.min(5, nextDifficulty)),
      difficultyMax: Math.max(1, Math.min(5, nextDifficulty)),
      title: nextDrillTemplate
        ? `Follow-up drill: ${nextDrillTemplate.title}`
        : `Follow-up drill: ${assignedNextDrillFamily!.replace(/_/g, " ")}`,
      notes: input.followUpAction ?? input.managerNotes ?? null,
    } as any).returning({ id: assignments.id });
    const assignmentId = assignmentInsert[0]?.id;
    await logAudit(reviewer.id, "assignment_create", "assignment", assignmentId, {
      source: "manager_review",
      sessionId: input.sessionId,
      employeeId: session.userId,
      assignedNextDrill: assignedNextDrillFamily,
      assignedNextDrillTemplateId: nextDrillTemplate?.id ?? null,
    });
  }

  return { success: true };
}
