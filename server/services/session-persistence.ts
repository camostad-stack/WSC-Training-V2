import { eq } from "drizzle-orm";
import { employeeProfiles, simulationSessions } from "../../drizzle/schema";
import { updateEmployeeProfile } from "../ai-orchestrator";
import { getDb } from "../db";
import {
  aiStructuredPersistenceSchema,
  stateHistorySchema,
  timingMarkersSchema,
  transcriptSchema,
  turnEventsSchema,
} from "./ai/contracts";
import { updateAssignmentCompletionIfNeeded } from "./assignments";
import { evaluateConversationTerminalState, getConversationOutcomeState } from "../../shared/conversation-outcome";
import {
  normalizeDepartment,
  normalizePassFail,
  normalizeProfileReadiness,
  normalizeProfileTrend,
  normalizeReadinessSignal,
  normalizeSessionQuality,
} from "./normalizers";

export interface SaveSimulationSessionInput {
  scenarioId: string;
  scenarioTemplateId?: number;
  assignmentId?: number;
  department?: string;
  scenarioFamily?: string;
  employeeRole: string;
  difficulty: number;
  mode: string;
  scenarioJson: unknown;
  transcript: unknown;
  stateHistory?: unknown;
  policyGrounding?: unknown;
  visibleBehavior?: unknown;
  evaluationResult?: unknown;
  coachingResult?: unknown;
  managerDebrief?: unknown;
  sessionQuality?: string;
  lowEffortResult?: unknown;
  turnCount?: number;
  overallScore?: number;
  passFail?: string;
  readinessSignal?: string;
  categoryScores?: unknown;
  status?: string;
  flagReason?: string;
  turnEvents?: unknown;
  timingMarkers?: unknown;
}

function coerceTranscript(value: unknown) {
  const parsed = transcriptSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function coerceStateHistory(value: unknown) {
  const parsed = stateHistorySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function coerceObject<T extends Record<string, unknown>>(value: unknown): T | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as T;
}

export function buildSessionValues(userId: number, input: SaveSimulationSessionInput): Record<string, unknown> {
  const validatedArtifacts = aiStructuredPersistenceSchema.safeParse({
    transcript: input.transcript,
    stateHistory: input.stateHistory,
    policyGrounding: input.policyGrounding,
    visibleBehavior: input.visibleBehavior,
    evaluationResult: input.evaluationResult,
    coachingResult: input.coachingResult,
    managerDebrief: input.managerDebrief,
    lowEffortResult: input.lowEffortResult,
  });
  if (!validatedArtifacts.success) {
    throw new Error(`Invalid structured AI payloads for persistence: ${validatedArtifacts.error.message}`);
  }

  const evaluation = coerceObject<Record<string, unknown>>(input.evaluationResult);
  const transcript = validatedArtifacts.data.transcript;
  const turnEvents = turnEventsSchema.safeParse(input.turnEvents).success ? turnEventsSchema.parse(input.turnEvents) : [];
  const timingMarkers = timingMarkersSchema.safeParse(input.timingMarkers).success ? timingMarkersSchema.parse(input.timingMarkers) : [];
  const stateHistory = (() => {
    const parsed = [...validatedArtifacts.data.stateHistory];
    if (parsed.length === 0) return parsed;
    const finalIndex = parsed.length - 1;
    const finalState = parsed[finalIndex];
    const terminalValidation = evaluateConversationTerminalState(finalState);
    parsed[finalIndex] = {
      ...finalState,
      continue_simulation: !terminalValidation.isTerminal,
      terminal_validation_reason: terminalValidation.terminalReason,
      completion_blockers: terminalValidation.blockedBy,
    };
    return parsed;
  })();
  const finalState = stateHistory[stateHistory.length - 1];
  const terminalValidation = evaluateConversationTerminalState(finalState);
  const finalOutcome = getConversationOutcomeState(finalState);
  const sessionStatus = (() => {
    if (finalOutcome === "ABANDONED" || finalOutcome === "TIMED_OUT") return "abandoned";
    if (input.status === "invalid" || input.status === "reprocess") return input.status;
    if (terminalValidation.isTerminal) return "completed";
    return "in_progress";
  })();
  const derivedOverallScore = typeof input.overallScore === "number"
    ? (sessionStatus === "completed" ? input.overallScore : undefined)
    : typeof evaluation?.overall_score === "number"
      ? (sessionStatus === "completed" ? (evaluation.overall_score as number) : undefined)
      : undefined;
  const derivedPassFail = sessionStatus === "completed"
    ? normalizePassFail(input.passFail ?? (typeof evaluation?.pass_fail === "string" ? evaluation.pass_fail : undefined))
    : undefined;
  const derivedReadiness = normalizeReadinessSignal(
    sessionStatus === "completed"
      ? input.readinessSignal ?? (typeof evaluation?.readiness_signal === "string" ? evaluation.readiness_signal : undefined)
      : undefined,
  );
  const derivedCategoryScores = sessionStatus === "completed" ? (input.categoryScores ?? evaluation?.category_scores) : undefined;
  const normalizedDepartment = input.department
    ? normalizeDepartment(input.department) ?? "customer_service"
    : undefined;
  const normalizedSessionQuality = input.sessionQuality !== undefined
    ? normalizeSessionQuality(input.sessionQuality)
    : undefined;

  const sessionValues: Record<string, unknown> = {
    userId,
    scenarioId: input.scenarioId,
    employeeRole: input.employeeRole,
    difficulty: input.difficulty,
    mode: input.mode ?? "in_person",
    status: sessionStatus,
    scenarioJson: input.scenarioJson,
    transcript,
    turnEvents,
    timingMarkers,
    stateHistory,
    turnCount: input.turnCount ?? transcript.length,
  };

  if (input.scenarioTemplateId !== undefined) sessionValues.scenarioTemplateId = input.scenarioTemplateId;
  if (input.assignmentId !== undefined) sessionValues.assignmentId = input.assignmentId;
  if (normalizedDepartment !== undefined) sessionValues.department = normalizedDepartment;
  if (input.scenarioFamily !== undefined) sessionValues.scenarioFamily = input.scenarioFamily;
  if (validatedArtifacts.data.policyGrounding !== undefined) sessionValues.policyGrounding = validatedArtifacts.data.policyGrounding;
  if (validatedArtifacts.data.visibleBehavior !== undefined) sessionValues.visibleBehavior = validatedArtifacts.data.visibleBehavior;
  if (validatedArtifacts.data.evaluationResult !== undefined) sessionValues.evaluationResult = validatedArtifacts.data.evaluationResult;
  if (validatedArtifacts.data.coachingResult !== undefined) sessionValues.coachingResult = validatedArtifacts.data.coachingResult;
  if (validatedArtifacts.data.managerDebrief !== undefined) sessionValues.managerDebrief = validatedArtifacts.data.managerDebrief;
  if (normalizedSessionQuality !== undefined) sessionValues.sessionQuality = normalizedSessionQuality;
  if (validatedArtifacts.data.lowEffortResult !== undefined) sessionValues.lowEffortResult = validatedArtifacts.data.lowEffortResult;
  if (derivedOverallScore !== undefined) sessionValues.overallScore = derivedOverallScore;
  if (derivedPassFail !== undefined) sessionValues.passFail = derivedPassFail;
  if (derivedReadiness !== undefined) sessionValues.readinessSignal = derivedReadiness;
  if (derivedCategoryScores !== undefined) sessionValues.categoryScores = derivedCategoryScores;
  if (sessionStatus === "reprocess" || sessionStatus === "invalid") {
    sessionValues.isFlagged = true;
    sessionValues.flagReason = input.flagReason ?? "AI pipeline requested reprocessing";
  }
  if (sessionStatus === "abandoned") {
    sessionValues.isFlagged = true;
    sessionValues.flagReason = input.flagReason ?? finalState?.outcome_summary ?? "Conversation ended without a valid resolution or escalation.";
  }
  if (sessionStatus === "completed" && input.evaluationResult) sessionValues.completedAt = new Date();

  return sessionValues;
}

async function updateEmployeeProfileFromSession(
  userId: number,
  input: SaveSimulationSessionInput,
) {
  if (!input.evaluationResult || input.status !== "completed") return;

  const db = await getDb();
  if (!db) return;

  try {
    const profileRows = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1);
    let currentProfile = profileRows[0] ?? null;

    if (!currentProfile) {
      await db.insert(employeeProfiles).values({
        userId,
        totalSessions: 0,
      });
      const insertedRows = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1);
      currentProfile = insertedRows[0] ?? null;
    }

    if (!currentProfile) return;

    const profileUpdate = await updateEmployeeProfile({
      currentProfile: {
        level_estimate: currentProfile.levelEstimate || "unknown",
        readiness_status: currentProfile.readinessStatus,
        trend: currentProfile.trend || "flat",
        skill_map: currentProfile.skillMap || {},
        total_sessions: currentProfile.totalSessions,
        average_score: currentProfile.averageScore,
      },
      sessionBundle: {
        scenario: input.scenarioJson,
        evaluation: input.evaluationResult,
        coaching: input.coachingResult,
      },
    });

    const nextTotalSessions = (currentProfile.totalSessions || 0) + 1;
    const nextAverageScore = input.overallScore !== undefined
      ? Math.round((((currentProfile.averageScore || 0) * (currentProfile.totalSessions || 0)) + input.overallScore) / nextTotalSessions)
      : currentProfile.averageScore;

    await db.update(employeeProfiles).set({
      levelEstimate: profileUpdate.level_estimate,
      readinessStatus: normalizeProfileReadiness(profileUpdate.readiness_status) as any,
      trend: normalizeProfileTrend(profileUpdate.trend) as any,
      skillMap: profileUpdate.skill_map,
      strongestFamilies: profileUpdate.strongest_scenario_families,
      weakestFamilies: profileUpdate.weakest_scenario_families,
      pressureHandling: profileUpdate.pressure_handling,
      consistencyScore: profileUpdate.consistency_score,
      totalSessions: nextTotalSessions,
      averageScore: nextAverageScore,
      managerAttentionFlag: profileUpdate.manager_attention_flag,
    }).where(eq(employeeProfiles.userId, userId));
  } catch (error) {
    console.error("[Profile Update] Failed:", error);
  }
}

export async function saveSimulationSession(userId: number, input: SaveSimulationSessionInput) {
  const db = await getDb();
  if (!db) {
    return { success: false, sessionId: null };
  }

  const sessionValues = buildSessionValues(userId, input);
  const result = await db
    .insert(simulationSessions)
    .values(sessionValues as any)
    .returning({ id: simulationSessions.id });
  const sessionId = result[0]?.id ?? null;

  await updateAssignmentCompletionIfNeeded(input.assignmentId, sessionValues.status === "completed" && Boolean(input.evaluationResult));
  await updateEmployeeProfileFromSession(userId, {
    ...input,
    status: sessionValues.status as string | undefined,
    overallScore: (sessionValues.overallScore as number | undefined) ?? input.overallScore,
  });

  return { success: true, sessionId };
}
