import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { IMPERSONATION_COOKIE_NAME } from "./_core/sdk";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb, getUserById } from "./db";
import {
  users,
  employeeProfiles,
  simulationSessions,
  scenarioTemplates,
  sessionMedia,
  managerReviews,
  assignments,
  policyDocuments,
  auditLogs,
  DEPARTMENTS,
  USER_ROLES,
  SESSION_MODES,
  SESSION_STATUSES,
  ASSIGNMENT_STATUSES,
  REVIEW_STATUSES,
  EMOTIONAL_INTENSITIES,
  SCENARIO_COMPLEXITIES,
  PASS_FAIL,
  READINESS_STATUSES,
  PERFORMANCE_SIGNALS,
  SESSION_QUALITY_VALUES,
  AUDIT_ACTIONS,
} from "../drizzle/schema";
import { eq, desc, and, sql, inArray, isNull, or, gte, lte, like, asc } from "drizzle-orm";
import {
  generateScenario,
  processEmployeeTurn,
  runPostSessionEvaluation,
  getAdaptiveDifficulty,
} from "./ai-orchestrator";
import { TRPCError } from "@trpc/server";
import { assertManagerCanAccessEmployee, assertManagerCanAccessSession, isGlobalAdmin } from "./services/access-control";
import { markAssignmentInProgress } from "./services/assignments";
import { logAudit } from "./services/audit-log";
import { createLiveVoiceSessionCredentials } from "./services/live-voice";
import { normalizeDepartment } from "./services/normalizers";
import { normalizePolicyScenarioFamilies } from "./services/policy-matching";
import { createManagerReview } from "./services/reviews";
import { saveSimulationSession } from "./services/session-persistence";
import { getSupabaseAdmin } from "./_core/supabase";
import { ENV } from "./_core/env";
import { createSignedStorageUrl } from "./storage";
import { WSC_SCENARIO_TEMPLATE_SEEDS } from "./wsc-seed-data";

// ─── Manager Procedure (manager, admin, super_admin) ───
const managerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !["manager", "admin", "super_admin"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
  }
  return next({ ctx });
});

const departmentEnum = z.enum(DEPARTMENTS);
const userRoleEnum = z.enum(USER_ROLES);
const sessionModeEnum = z.enum(SESSION_MODES);
const sessionStatusEnum = z.enum(SESSION_STATUSES);
const assignmentStatusEnum = z.enum(ASSIGNMENT_STATUSES);
const reviewStatusEnum = z.enum(REVIEW_STATUSES);
const emotionalIntensityEnum = z.enum(EMOTIONAL_INTENSITIES);
const scenarioComplexityEnum = z.enum(SCENARIO_COMPLEXITIES);
const passFailEnum = z.enum(PASS_FAIL);
const readinessStatusEnum = z.enum(READINESS_STATUSES);
const performanceSignalEnum = z.enum(PERFORMANCE_SIGNALS);
const sessionQualityEnum = z.enum(SESSION_QUALITY_VALUES);

function clampRecommendedTurns(value?: number) {
  return Math.max(3, Math.min(5, value ?? 4));
}

function buildScenarioFromTemplate(t: typeof scenarioTemplates.$inferSelect) {
  return {
    scenario_id: `tmpl-${t.id}`,
    department: t.department,
    employee_role: t.targetRole,
    difficulty: t.difficulty,
    scenario_family: t.scenarioFamily,
    customer_persona: t.customerPersona,
    situation_summary: t.situationSummary,
    opening_line: t.openingLine,
    hidden_facts: t.hiddenFacts || [],
    approved_resolution_paths: t.approvedResolutionPaths || [],
    required_behaviors: t.requiredBehaviors || [],
    critical_errors: t.criticalErrors || [],
    branch_logic: t.branchLogic || {},
    emotion_progression: t.emotionProgression || { starting_state: "frustrated", better_if: [], worse_if: [] },
    completion_rules: t.completionRules || { resolved_if: [], end_early_if: [], manager_required_if: [] },
    recommended_turns: clampRecommendedTurns(t.recommendedTurns),
  };
}

function buildScenarioFromSeed(input: {
  department: typeof DEPARTMENTS[number];
  scenarioFamily?: string;
  difficulty: number;
  employeeRole: string;
}) {
  const candidates = WSC_SCENARIO_TEMPLATE_SEEDS
    .filter((seed) => seed.department === input.department)
    .filter((seed) => !input.scenarioFamily || seed.scenarioFamily === input.scenarioFamily)
    .sort((a, b) => {
      const difficultyDelta = Math.abs(a.difficulty - input.difficulty) - Math.abs(b.difficulty - input.difficulty);
      if (difficultyDelta !== 0) return difficultyDelta;
      return a.title.localeCompare(b.title);
    });

  const selected = candidates[0]
    ?? WSC_SCENARIO_TEMPLATE_SEEDS.find((seed) => seed.department === input.department)
    ?? WSC_SCENARIO_TEMPLATE_SEEDS[0];

  return {
    scenario_id: `seed-${selected.scenarioFamily}-${selected.difficulty}`,
    department: selected.department,
    employee_role: input.employeeRole || selected.targetRole,
    difficulty: selected.difficulty,
    scenario_family: selected.scenarioFamily,
    customer_persona: selected.customerPersona,
    situation_summary: selected.situationSummary,
    opening_line: selected.openingLine,
    hidden_facts: selected.hiddenFacts || [],
    approved_resolution_paths: selected.approvedResolutionPaths || [],
    required_behaviors: selected.requiredBehaviors || [],
    critical_errors: selected.criticalErrors || [],
    branch_logic: selected.branchLogic || {},
    emotion_progression: selected.emotionProgression || { starting_state: "frustrated", better_if: [], worse_if: [] },
    completion_rules: selected.completionRules || { resolved_if: [], end_early_if: [], manager_required_if: [] },
    recommended_turns: clampRecommendedTurns(selected.recommendedTurns),
  };
}

// ─── Router ───

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;

        return {
          user: ctx.user,
          actorUser: ctx.actorUser ?? ctx.user,
        impersonation: ctx.impersonation
          ? {
            active: true,
            targetUserId: ctx.impersonation.targetUserId,
            targetUserName: ctx.user.name ?? ctx.user.email ?? `User ${ctx.user.id}`,
            actorUserId: (ctx.actorUser ?? ctx.user).id,
            actorUserName: (ctx.actorUser ?? ctx.user).name ?? (ctx.actorUser ?? ctx.user).email ?? `User ${(ctx.actorUser ?? ctx.user).id}`,
          }
          : null,
        } as const;
    }),
    register: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        }

        const existingUsers = await getSupabaseAdmin().auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });

        const existingAuthUser = existingUsers.data?.users.find((user) =>
          user.email?.toLowerCase() === input.email.toLowerCase()
        );

        if (existingAuthUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with that email already exists",
          });
        }

        const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: {
            name: input.name,
            full_name: input.name,
          },
        });

        if (error || !data.user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error?.message ?? "Unable to create account",
          });
        }

        await db.insert(users).values({
          openId: data.user.id,
          name: input.name,
          email: input.email,
          role: "employee",
          isActive: true,
          loginMethod: "supabase_email",
          lastSignedIn: new Date(),
        });

        return {
          success: true,
          email: input.email,
        } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(IMPERSONATION_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    startImpersonation: protectedProcedure
      .input(z.object({ targetUserId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const actorUser = ctx.actorUser ?? ctx.user;
        if (!actorUser || !["admin", "super_admin"].includes(actorUser.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const targetUser = await getUserById(input.targetUserId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
        }
        if (!targetUser.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Target user is inactive" });
        }
        if (!["employee", "shift_lead"].includes(targetUser.role)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only employee accounts can be used for employee-view testing" });
        }

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(IMPERSONATION_COOKIE_NAME, String(targetUser.id), {
          ...cookieOptions,
          maxAge: 1000 * 60 * 60 * 8,
        });
        await logAudit(actorUser.id, "role_change", "user", targetUser.id, {
          impersonation: "start",
          actorUserId: actorUser.id,
          actorRole: actorUser.role,
        });

        return {
          success: true,
          targetUser: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
          },
        } as const;
      }),
    stopImpersonation: protectedProcedure
      .mutation(async ({ ctx }) => {
        const actorUser = ctx.actorUser ?? ctx.user;
        if (!actorUser || !["admin", "super_admin"].includes(actorUser.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(IMPERSONATION_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        if (ctx.impersonation?.targetUserId) {
          await logAudit(actorUser.id, "role_change", "user", ctx.impersonation.targetUserId, {
            impersonation: "stop",
            actorUserId: actorUser.id,
            actorRole: actorUser.role,
          });
        }
        return { success: true } as const;
      }),
  }),

  // ─── Employee Profile ───
  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, ctx.user.id)).limit(1);
      return rows[0] ?? null;
    }),

    getByUserId: managerProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        await assertManagerCanAccessEmployee(ctx.user, input.userId);
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, input.userId)).limit(1);
        return rows[0] ?? null;
      }),

    updateNotes: managerProcedure
      .input(z.object({ userId: z.number(), notes: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await assertManagerCanAccessEmployee(ctx.user, input.userId);
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(employeeProfiles).set({ managerNotes: input.notes }).where(eq(employeeProfiles.userId, input.userId));
        await logAudit(ctx.user.id, "profile_update", "employee_profile", input.userId, { managerNotes: input.notes });
        return { success: true };
      }),
  }),

  // ─── AI Simulator ───
  simulator: router({
    generateScenario: protectedProcedure
      .input(z.object({
        department: departmentEnum.default("customer_service"),
        employeeRole: z.string(),
        difficulty: z.number().min(1).max(5),
        mode: sessionModeEnum.default("in_person"),
        scenarioFamily: z.string().optional(),
        scenarioTemplateId: z.number().optional(),
        employeeLevelEstimate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        let db = null;
        try {
          db = await getDb();
        } catch (error) {
          console.error("[Scenario Generation] Database unavailable, falling back to bundled catalog:", error);
        }

        // If a template is specified, load it
        if (input.scenarioTemplateId && db) {
          const rows = await db.select().from(scenarioTemplates).where(eq(scenarioTemplates.id, input.scenarioTemplateId)).limit(1);
          if (rows[0]) {
            return { scenario: buildScenarioFromTemplate(rows[0]) };
          }
        }

        if (!ENV.forgeApiKey) {
          if (db) {
            const filters = [eq(scenarioTemplates.department, input.department), eq(scenarioTemplates.isActive, true)];
            if (input.scenarioFamily) {
              filters.push(eq(scenarioTemplates.scenarioFamily, input.scenarioFamily));
            }

            const candidates = await db.select()
              .from(scenarioTemplates)
              .where(and(...filters));

            if (candidates.length > 0) {
              const selected = candidates.sort((a, b) => {
                const difficultyDelta = Math.abs(a.difficulty - input.difficulty) - Math.abs(b.difficulty - input.difficulty);
                if (difficultyDelta !== 0) return difficultyDelta;
                return a.id - b.id;
              })[0];

              return { scenario: buildScenarioFromTemplate(selected) };
            }
          }

          return {
            scenario: buildScenarioFromSeed({
              department: input.department,
              scenarioFamily: input.scenarioFamily,
              difficulty: input.difficulty,
              employeeRole: input.employeeRole,
            }),
          };
        }

        try {
          const scenario = await generateScenario(input);
          return { scenario };
        } catch (error) {
          console.error("[Scenario Generation] AI generation failed, falling back to bundled catalog:", error);
          return {
            scenario: buildScenarioFromSeed({
              department: input.department,
              scenarioFamily: input.scenarioFamily,
              difficulty: input.difficulty,
              employeeRole: input.employeeRole,
            }),
          };
        }
      }),

    customerReply: protectedProcedure
      .input(z.object({
        scenarioJson: z.any(),
        stateJson: z.any().optional(),
        transcript: z.array(z.object({
          role: z.enum(["customer", "employee"]),
          message: z.string(),
          emotion: z.string().optional(),
        })),
        employeeResponse: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await processEmployeeTurn(input);
      }),

    evaluate: protectedProcedure
      .input(z.object({
        scenarioJson: z.any(),
        transcript: z.array(z.object({
          role: z.enum(["customer", "employee"]),
          message: z.string(),
          emotion: z.string().optional(),
        })),
        stateHistory: z.array(z.any()).optional(),
        employeeName: z.string().optional(),
        employeeRole: z.string(),
        media: z.array(z.object({
          mediaType: z.enum(["video", "audio", "transcript_file"]),
          storageUrl: z.string(),
          mimeType: z.string().optional(),
          durationSeconds: z.number().optional().nullable(),
          turnNumber: z.number().optional().nullable(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        return await runPostSessionEvaluation({
          ...input,
          stateHistory: input.stateHistory || [],
        });
      }),

    saveSession: protectedProcedure
      .input(z.object({
        scenarioId: z.string(),
        scenarioTemplateId: z.number().optional(),
        assignmentId: z.number().optional(),
        department: departmentEnum.optional(),
        scenarioFamily: z.string().optional(),
        employeeRole: z.string(),
        difficulty: z.number().min(1).max(5),
        mode: sessionModeEnum,
        scenarioJson: z.any(),
        transcript: z.array(z.object({
          role: z.enum(["customer", "employee"]),
          message: z.string(),
          emotion: z.string().optional(),
          timestamp: z.number().optional(),
        })),
        turnEvents: z.array(z.object({
          type: z.string(),
          source: z.enum(["system", "employee", "customer"]),
          atMs: z.number(),
          payload: z.record(z.string(), z.unknown()).optional(),
        })).optional(),
        timingMarkers: z.array(z.object({
          name: z.string(),
          atMs: z.number(),
          detail: z.string().optional(),
        })).optional(),
        stateHistory: z.array(z.object({
          turn_number: z.number(),
          emotion_state: z.string(),
          trust_level: z.number(),
          issue_clarity: z.number(),
          employee_flags: z.record(z.string(), z.boolean()),
          escalation_required: z.boolean(),
          scenario_risk_level: z.string(),
        })).optional(),
        turnCount: z.number().optional(),
        policyGrounding: z.any().optional(),
        visibleBehavior: z.any().optional(),
        evaluationResult: z.any().optional(),
        coachingResult: z.any().optional(),
        managerDebrief: z.any().optional(),
        sessionQuality: sessionQualityEnum.optional(),
        lowEffortResult: z.any().optional(),
        overallScore: z.number().min(0).max(100).optional(),
        passFail: passFailEnum.optional(),
        readinessSignal: readinessStatusEnum.optional(),
        categoryScores: z.any().optional(),
        status: sessionStatusEnum.optional(),
        flagReason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return await saveSimulationSession(ctx.user.id, input);
      }),

    adaptiveDifficulty: protectedProcedure
      .input(z.object({
        employeeProfile: z.any().optional(),
        recentSessions: z.array(z.any()).optional(),
      }))
      .mutation(async ({ input }) => {
        return await getAdaptiveDifficulty({
          employeeProfile: input.employeeProfile,
          recentSessions: input.recentSessions || [],
        });
      }),
  }),

  liveVoice: router({
    createCredentials: protectedProcedure
      .input(z.object({
        scenarioJson: z.any(),
        employeeRole: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await createLiveVoiceSessionCredentials({
          scenario: input.scenarioJson,
          employeeRole: input.employeeRole,
        });
      }),
  }),

  // ─── Sessions (Employee sees own, Manager sees team) ───
  sessions: router({
    myRecent: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(simulationSessions)
          .where(eq(simulationSessions.userId, ctx.user.id))
          .orderBy(desc(simulationSessions.createdAt))
          .limit(input.limit);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(simulationSessions).where(eq(simulationSessions.id, input.id)).limit(1);
        const session = rows[0];
        if (!session) return null;
        if (session.userId === ctx.user.id) {
          return session;
        }

        if (!["manager", "admin", "super_admin"].includes(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await assertManagerCanAccessEmployee(ctx.user, session.userId);
        return session;
      }),

    getMedia: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        const sessionRows = await db.select({
          id: simulationSessions.id,
          userId: simulationSessions.userId,
        })
          .from(simulationSessions)
          .where(eq(simulationSessions.id, input.sessionId))
          .limit(1);

        const session = sessionRows[0];
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
        }

        if (session.userId !== ctx.user.id) {
          if (!["manager", "admin", "super_admin"].includes(ctx.user.role)) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          await assertManagerCanAccessEmployee(ctx.user, session.userId);
        }

        const mediaItems = await db.select({
          id: sessionMedia.id,
          mediaType: sessionMedia.mediaType,
          storageUrl: sessionMedia.storageUrl,
          storageKey: sessionMedia.storageKey,
          mimeType: sessionMedia.mimeType,
          durationSeconds: sessionMedia.durationSeconds,
          turnNumber: sessionMedia.turnNumber,
          createdAt: sessionMedia.createdAt,
        })
          .from(sessionMedia)
          .where(eq(sessionMedia.sessionId, input.sessionId))
          .orderBy(asc(sessionMedia.turnNumber), asc(sessionMedia.createdAt));

        return await Promise.all(mediaItems.map(async (item) => ({
          ...item,
          storageUrl: item.storageKey
            ? await createSignedStorageUrl(item.storageKey, { fallbackBucket: "session-media" }).catch(() => item.storageUrl)
            : item.storageUrl,
        })));
      }),

    // Manager: list team sessions with filters
    teamSessions: managerProcedure
      .input(z.object({
        employeeId: z.number().optional(),
        department: departmentEnum.optional(),
        scenarioFamily: z.string().optional(),
        status: sessionStatusEnum.optional(),
        isFlagged: z.boolean().optional(),
        reviewStatus: reviewStatusEnum.optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { sessions: [], total: 0 };

        // Get team member IDs
        const isGlobalAdmin = ["admin", "super_admin"].includes(ctx.user.role);
        let teamIds: number[] = [];
        if (!isGlobalAdmin) {
          const teamMembers = await db.select({ id: users.id }).from(users)
            .where(eq(users.managerId, ctx.user.id));
          teamIds = teamMembers.map(m => m.id);
          if (teamIds.length === 0) return { sessions: [], total: 0 };
        }

        const conditions = [];
        if (!isGlobalAdmin && teamIds.length > 0) {
          conditions.push(inArray(simulationSessions.userId, teamIds));
        }
        if (input.employeeId) conditions.push(eq(simulationSessions.userId, input.employeeId));
        if (input.department) conditions.push(eq(simulationSessions.department, input.department as any));
        if (input.scenarioFamily) conditions.push(eq(simulationSessions.scenarioFamily, input.scenarioFamily));
        if (input.status) conditions.push(eq(simulationSessions.status, input.status as any));
        if (input.isFlagged !== undefined) conditions.push(eq(simulationSessions.isFlagged, input.isFlagged));
        if (input.reviewStatus) conditions.push(eq(simulationSessions.reviewStatus, input.reviewStatus as any));

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const sessions = await db.select({
          session: simulationSessions,
          employeeName: users.name,
        })
          .from(simulationSessions)
          .leftJoin(users, eq(simulationSessions.userId, users.id))
          .where(where)
          .orderBy(desc(simulationSessions.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return {
          sessions: sessions.map(s => ({ ...s.session, employeeName: s.employeeName })),
          total: sessions.length,
        };
      }),

    // Manager: flag a session
    flagSession: managerProcedure
      .input(z.object({ sessionId: z.number(), reason: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { db } = await assertManagerCanAccessSession(ctx.user, input.sessionId);
        if (!db) return { success: false };
        await db.update(simulationSessions).set({
          isFlagged: true,
          flagReason: input.reason,
          reviewStatus: "flagged",
        }).where(eq(simulationSessions.id, input.sessionId));
        await logAudit(ctx.user.id, "manager_review", "session", input.sessionId, { action: "flag", reason: input.reason });
        return { success: true };
      }),
  }),

  // ─── Manager Reviews ───
  reviews: router({
    create: managerProcedure
      .input(z.object({
        sessionId: z.number(),
        employeeId: z.number(),
        originalScore: z.number().optional(),
        overrideScore: z.number().min(0).max(100).optional(),
        overrideReason: z.string().trim().optional(),
        managerNotes: z.string().optional(),
        performanceSignal: performanceSignalEnum.optional(),
        followUpRequired: z.boolean().default(false),
        followUpAction: z.string().optional(),
        shadowingNeeded: z.boolean().default(false),
        assignedNextDrillTemplateId: z.number().optional(),
        assignedNextDrill: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createManagerReview(ctx.user, input);
      }),

    getForSession: managerProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input, ctx }) => {
        await assertManagerCanAccessSession(ctx.user, input.sessionId);
        const db = await getDb();
        if (!db) return [];
        const rows = await db.select({
          review: managerReviews,
          reviewerName: users.name,
        })
          .from(managerReviews)
          .leftJoin(users, eq(managerReviews.reviewerId, users.id))
          .where(eq(managerReviews.sessionId, input.sessionId))
          .orderBy(desc(managerReviews.createdAt));
        return rows.map((row) => ({
          ...row.review,
          reviewerName: row.reviewerName,
        }));
      }),
  }),

  // ─── Assignments ───
  assignments: router({
    myAssignments: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(assignments)
        .where(eq(assignments.employeeId, ctx.user.id))
        .orderBy(desc(assignments.createdAt));
    }),

    start: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await markAssignmentInProgress(ctx.user.id, input.id);
      }),

    create: managerProcedure
      .input(z.object({
        employeeId: z.number(),
        scenarioTemplateId: z.number().optional(),
        scenarioFamily: z.string().optional(),
        department: departmentEnum.optional(),
        difficultyMin: z.number().min(1).max(5).default(1),
        difficultyMax: z.number().min(1).max(5).default(5),
        requiredAttempts: z.number().min(1).default(1),
        title: z.string(),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertManagerCanAccessEmployee(ctx.user, input.employeeId);
        const db = await getDb();
        if (!db) return { success: false };
        const normalizedDepartment = normalizeDepartment(input.department);
        if (input.department !== undefined && !normalizedDepartment) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid department" });
        }
        const values: Record<string, any> = {
          employeeId: input.employeeId,
          assignedBy: ctx.user.id,
          difficultyMin: input.difficultyMin,
          difficultyMax: input.difficultyMax,
          requiredAttempts: input.requiredAttempts,
          title: input.title,
        };
        if (input.scenarioTemplateId !== undefined) values.scenarioTemplateId = input.scenarioTemplateId;
        if (input.scenarioFamily !== undefined) values.scenarioFamily = input.scenarioFamily;
        if (normalizedDepartment !== undefined) values.department = normalizedDepartment;
        if (input.notes !== undefined) values.notes = input.notes;
        if (input.dueDate) values.dueDate = new Date(input.dueDate);
        await db.insert(assignments).values(values as any);
        await logAudit(ctx.user.id, "assignment_create", "assignment", undefined, { employeeId: input.employeeId, title: input.title });
        return { success: true };
      }),

    update: managerProcedure
      .input(z.object({
        id: z.number(),
        status: assignmentStatusEnum.optional(),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const assignmentRows = await db.select().from(assignments).where(eq(assignments.id, input.id)).limit(1);
        const assignment = assignmentRows[0];
        if (!assignment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
        }
        await assertManagerCanAccessEmployee(ctx.user, assignment.employeeId);

        const updateData: any = {};
        if (input.status) updateData.status = input.status;
        if (input.notes !== undefined) updateData.notes = input.notes;
        if (input.dueDate) updateData.dueDate = new Date(input.dueDate);
        await db.update(assignments).set(updateData).where(eq(assignments.id, input.id));
        await logAudit(ctx.user.id, "assignment_edit", "assignment", input.id, updateData);
        return { success: true };
      }),

    teamAssignments: managerProcedure
      .input(z.object({ employeeId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        if (input.employeeId) {
          await assertManagerCanAccessEmployee(ctx.user, input.employeeId);
        }

        let where;
        if (input.employeeId) {
          where = eq(assignments.employeeId, input.employeeId);
        } else if (isGlobalAdmin(ctx.user.role)) {
          where = undefined;
        } else {
          const teamMembers = await db.select({ id: users.id }).from(users).where(eq(users.managerId, ctx.user.id));
          const teamIds = teamMembers.map(member => member.id);
          if (teamIds.length === 0) return [];
          where = inArray(assignments.employeeId, teamIds);
        }

        const rows = await db.select({
          id: assignments.id,
          employeeId: assignments.employeeId,
          assignedBy: assignments.assignedBy,
          scenarioTemplateId: assignments.scenarioTemplateId,
          scenarioFamily: assignments.scenarioFamily,
          department: assignments.department,
          difficultyMin: assignments.difficultyMin,
          difficultyMax: assignments.difficultyMax,
          requiredAttempts: assignments.requiredAttempts,
          completedAttempts: assignments.completedAttempts,
          status: assignments.status,
          title: assignments.title,
          notes: assignments.notes,
          dueDate: assignments.dueDate,
          completedAt: assignments.completedAt,
          createdAt: assignments.createdAt,
          employeeName: users.name,
        })
          .from(assignments)
          .leftJoin(users, eq(assignments.employeeId, users.id))
          .where(where)
          .orderBy(desc(assignments.createdAt));
        return rows;
      }),
  }),

  // ─── Scenario Templates ───
  scenarios: router({
    list: protectedProcedure
      .input(z.object({
        department: departmentEnum.optional(),
        isActive: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input.department) conditions.push(eq(scenarioTemplates.department, input.department as any));
        if (input.isActive !== undefined) conditions.push(eq(scenarioTemplates.isActive, input.isActive));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return await db.select().from(scenarioTemplates).where(where).orderBy(desc(scenarioTemplates.createdAt));
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(scenarioTemplates).where(eq(scenarioTemplates.id, input.id)).limit(1);
        return rows[0] ?? null;
      }),

    create: adminProcedure
      .input(z.object({
        title: z.string(),
        department: departmentEnum,
        scenarioFamily: z.string(),
        targetRole: z.string(),
        difficulty: z.number().min(1).max(5),
        emotionalIntensity: emotionalIntensityEnum.optional(),
        complexity: scenarioComplexityEnum.optional(),
        customerPersona: z.any(),
        situationSummary: z.string(),
        openingLine: z.string(),
        hiddenFacts: z.array(z.string()).optional(),
        approvedResolutionPaths: z.array(z.string()).optional(),
        requiredBehaviors: z.array(z.string()).optional(),
        criticalErrors: z.array(z.string()).optional(),
        branchLogic: z.any().optional(),
        emotionProgression: z.any().optional(),
        completionRules: z.any().optional(),
        recommendedTurns: z.number().min(3).max(5).default(4),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.insert(scenarioTemplates).values({
          ...input,
          department: input.department as any,
          emotionalIntensity: (input.emotionalIntensity as any) ?? "moderate",
          complexity: (input.complexity as any) ?? "mixed",
          hiddenFacts: input.hiddenFacts ?? null,
          approvedResolutionPaths: input.approvedResolutionPaths ?? null,
          requiredBehaviors: input.requiredBehaviors ?? null,
          criticalErrors: input.criticalErrors ?? null,
          branchLogic: input.branchLogic ?? null,
          emotionProgression: input.emotionProgression ?? null,
          completionRules: input.completionRules ?? null,
          createdBy: ctx.user.id,
        });
        await logAudit(ctx.user.id, "scenario_create", "scenario_template", undefined, { title: input.title });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        difficulty: z.number().min(1).max(5).optional(),
        isActive: z.boolean().optional(),
        customerPersona: z.any().optional(),
        situationSummary: z.string().optional(),
        openingLine: z.string().optional(),
        hiddenFacts: z.array(z.string()).optional(),
        requiredBehaviors: z.array(z.string()).optional(),
        criticalErrors: z.array(z.string()).optional(),
        recommendedTurns: z.number().min(3).max(5).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const { id, ...updateData } = input;
        await db.update(scenarioTemplates).set(updateData as any).where(eq(scenarioTemplates.id, id));
        await logAudit(ctx.user.id, input.isActive !== undefined ? "scenario_toggle" : "scenario_edit", "scenario_template", id, updateData);
        return { success: true };
      }),
  }),

  // ─── Policy Documents ───
  policies: router({
    list: protectedProcedure
      .input(z.object({ department: departmentEnum.optional(), isActive: z.boolean().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input.department) conditions.push(eq(policyDocuments.department, input.department as any));
        if (input.isActive !== undefined) conditions.push(eq(policyDocuments.isActive, input.isActive));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return await db.select().from(policyDocuments).where(where).orderBy(desc(policyDocuments.createdAt));
      }),

    create: adminProcedure
      .input(z.object({
        title: z.string(),
        department: departmentEnum.optional(),
        scenarioFamilies: z.array(z.string()).optional(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.insert(policyDocuments).values({
          title: input.title,
          department: (input.department as any) ?? null,
          scenarioFamilies: normalizePolicyScenarioFamilies(input.scenarioFamilies),
          content: input.content,
          uploadedBy: ctx.user.id,
        });
        await logAudit(ctx.user.id, "policy_upload", "policy_document", undefined, { title: input.title });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string(),
        department: departmentEnum.optional(),
        scenarioFamilies: z.array(z.string()).optional(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };

        const existing = await db.select().from(policyDocuments).where(eq(policyDocuments.id, input.id)).limit(1);
        const current = existing[0];
        if (!current) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Policy document not found" });
        }

        const normalizedScenarioFamilies = normalizePolicyScenarioFamilies(input.scenarioFamilies);
        const titleChanged = current.title !== input.title;
        const departmentChanged = (current.department ?? null) !== ((input.department as any) ?? null);
        const contentChanged = current.content !== input.content;
        const familiesChanged = JSON.stringify(current.scenarioFamilies ?? []) !== JSON.stringify(normalizedScenarioFamilies ?? []);
        const version = titleChanged || departmentChanged || contentChanged || familiesChanged
          ? (current.version ?? 1) + 1
          : current.version;

        await db.update(policyDocuments).set({
          title: input.title,
          department: (input.department as any) ?? null,
          scenarioFamilies: normalizedScenarioFamilies,
          content: input.content,
          version,
        }).where(eq(policyDocuments.id, input.id));

        await logAudit(ctx.user.id, "policy_upload", "policy_document", input.id, {
          action: "edit",
          title: input.title,
          version,
        });

        return { success: true };
      }),

    activate: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(policyDocuments).set({ isActive: input.isActive }).where(eq(policyDocuments.id, input.id));
        await logAudit(ctx.user.id, "policy_activate", "policy_document", input.id, { isActive: input.isActive });
        return { success: true };
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };

        const existing = await db.select().from(policyDocuments).where(eq(policyDocuments.id, input.id)).limit(1);
        const current = existing[0];
        if (!current) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Policy document not found" });
        }

        await db.delete(policyDocuments).where(eq(policyDocuments.id, input.id));
        await logAudit(ctx.user.id, "policy_upload", "policy_document", input.id, {
          action: "delete",
          title: current.title,
          version: current.version,
        });
        return { success: true };
      }),
  }),

  // ─── Team Management (Manager) ───
  team: router({
    myTeam: managerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const isGlobalAdmin = ["admin", "super_admin"].includes(ctx.user.role);
      let members;
      if (isGlobalAdmin) {
        members = await db.select().from(users).where(eq(users.isActive, true));
      } else {
        members = await db.select().from(users).where(eq(users.managerId, ctx.user.id));
      }
      // Join with profiles
      const result = [];
      for (const member of members) {
        const profileRows = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, member.id)).limit(1);
        result.push({
          ...member,
          profile: profileRows[0] ?? null,
        });
      }
      return result;
    }),

    dashboard: managerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return {
        teamSize: 0, readinessDistribution: {}, pendingReviews: 0,
        flaggedSessions: 0, overdueAssignments: 0, commonGaps: [],
      };

      const isGlobalAdmin = ["admin", "super_admin"].includes(ctx.user.role);
      let teamCondition;
      if (!isGlobalAdmin) {
        teamCondition = eq(users.managerId, ctx.user.id);
      } else {
        teamCondition = eq(users.isActive, true);
      }

      const teamMembers = await db.select().from(users).where(teamCondition);
      const teamIds = teamMembers.map(m => m.id);
      if (teamIds.length === 0) return {
        teamSize: 0, readinessDistribution: {}, pendingReviews: 0,
        flaggedSessions: 0, overdueAssignments: 0, commonGaps: [],
      };

      // Readiness distribution
      const profiles = await db.select().from(employeeProfiles)
        .where(inArray(employeeProfiles.userId, teamIds));
      const readinessDistribution: Record<string, number> = {};
      for (const p of profiles) {
        const status = p.readinessStatus || "not_ready";
        readinessDistribution[status] = (readinessDistribution[status] || 0) + 1;
      }

      // Pending reviews
      const pendingSessions = await db.select({ count: sql<number>`count(*)` })
        .from(simulationSessions)
        .where(and(
          inArray(simulationSessions.userId, teamIds),
          eq(simulationSessions.reviewStatus, "pending"),
          eq(simulationSessions.status, "completed"),
        ));

      // Flagged sessions
      const flagged = await db.select({ count: sql<number>`count(*)` })
        .from(simulationSessions)
        .where(and(
          inArray(simulationSessions.userId, teamIds),
          eq(simulationSessions.isFlagged, true),
        ));

      // Overdue assignments
      const overdue = await db.select({ count: sql<number>`count(*)` })
        .from(assignments)
        .where(and(
          inArray(assignments.employeeId, teamIds),
          eq(assignments.status, "overdue"),
        ));

      // Common gaps (weakest families across team)
      const gapMap: Record<string, number> = {};
      for (const p of profiles) {
        for (const f of (p.weakestFamilies || [])) {
          gapMap[f] = (gapMap[f] || 0) + 1;
        }
      }
      const commonGaps = Object.entries(gapMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([family, count]) => ({ family, count }));

      return {
        teamSize: teamMembers.length,
        readinessDistribution,
        pendingReviews: Number(pendingSessions[0]?.count || 0),
        flaggedSessions: Number(flagged[0]?.count || 0),
        overdueAssignments: Number(overdue[0]?.count || 0),
        commonGaps,
      };
    }),
  }),

  // ─── Analytics (Manager) ───
  analytics: router({
    teamStats: managerProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const isGlobalAdmin = ["admin", "super_admin"].includes(ctx.user.role);
      let teamMembers;
      if (isGlobalAdmin) {
        teamMembers = await db.select().from(users).where(eq(users.isActive, true));
      } else {
        teamMembers = await db.select().from(users).where(eq(users.managerId, ctx.user.id));
      }
      const teamIds = teamMembers.map(m => m.id);
      if (teamIds.length === 0) return null;

      // Average score trend
      const sessions = await db.select({
        overallScore: simulationSessions.overallScore,
        createdAt: simulationSessions.createdAt,
        scenarioFamily: simulationSessions.scenarioFamily,
        passFail: simulationSessions.passFail,
      })
        .from(simulationSessions)
        .where(and(
          inArray(simulationSessions.userId, teamIds),
          eq(simulationSessions.status, "completed"),
        ))
        .orderBy(desc(simulationSessions.createdAt))
        .limit(200);

      const totalSessions = sessions.length;
      const avgScore = totalSessions > 0
        ? Math.round(sessions.reduce((sum, s) => sum + (s.overallScore || 0), 0) / totalSessions)
        : 0;

      const passCount = sessions.filter(s => s.passFail === "pass").length;
      const passRate = totalSessions > 0 ? Math.round((passCount / totalSessions) * 100) : 0;

      // Score by scenario family
      const familyScores: Record<string, { total: number; count: number }> = {};
      for (const s of sessions) {
        const f = s.scenarioFamily || "unknown";
        if (!familyScores[f]) familyScores[f] = { total: 0, count: 0 };
        familyScores[f].total += s.overallScore || 0;
        familyScores[f].count++;
      }

      // Assignment completion
      const allAssignments = await db.select().from(assignments)
        .where(inArray(assignments.employeeId, teamIds));
      const completedAssignments = allAssignments.filter(a => a.status === "completed").length;
      const assignmentCompletionRate = allAssignments.length > 0
        ? Math.round((completedAssignments / allAssignments.length) * 100)
        : 0;

      return {
        totalSessions,
        avgScore,
        passRate,
        familyScores: Object.entries(familyScores).map(([family, data]) => ({
          family,
          avgScore: Math.round(data.total / data.count),
          count: data.count,
        })),
        assignmentCompletionRate,
        totalAssignments: allAssignments.length,
        completedAssignments,
      };
    }),
  }),

  // ─── Admin: User Management ───
  admin: router({
    listUsers: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        role: userRoleEnum.optional(),
        isActive: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input.role) conditions.push(eq(users.role, input.role as any));
        if (input.isActive !== undefined) conditions.push(eq(users.isActive, input.isActive));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const allUsers = await db.select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          department: users.department,
          managerId: users.managerId,
          isActive: users.isActive,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        }).from(users).where(where).orderBy(desc(users.lastSignedIn));
        // Filter by search if provided
        if (input.search) {
          const s = input.search.toLowerCase();
          return allUsers.filter(u =>
            (u.name || "").toLowerCase().includes(s) ||
            (u.email || "").toLowerCase().includes(s)
          );
        }
        return allUsers;
      }),
    createUser: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: userRoleEnum.default("employee"),
        department: departmentEnum.optional().nullable(),
        managerId: z.number().optional().nullable(),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false, userId: null };

        try {
          const existingUsers = await getSupabaseAdmin().auth.admin.listUsers();
          const existingAuthUser = existingUsers.data?.users.find((user) => user.email?.toLowerCase() === input.email.toLowerCase());

          const authUser = existingAuthUser
            ? existingAuthUser
            : (await getSupabaseAdmin().auth.admin.createUser({
              email: input.email,
              password: input.password,
              email_confirm: true,
              user_metadata: {
                name: input.name,
                full_name: input.name,
              },
            })).data.user;

          if (!authUser) {
            throw new Error("Failed to create Supabase auth user");
          }

          const result = await db.insert(users).values({
            openId: authUser.id,
            name: input.name,
            email: input.email,
            role: input.role,
            department: input.department ?? null,
            managerId: input.managerId ?? null,
            isActive: input.isActive,
            loginMethod: "supabase_email",
            lastSignedIn: new Date(),
          } as any).returning({ id: users.id });
          const userId = result[0]?.id ?? null;
          await logAudit(ctx.user.id, "role_change", "user", userId, {
            created: true,
            role: input.role,
            department: input.department ?? null,
            managerId: input.managerId ?? null,
            isActive: input.isActive,
          });
          return { success: true, userId };
        } catch (error) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A user with that email already exists",
            cause: error,
          });
        }
      }),
    updateUser: adminProcedure
      .input(z.object({
        userId: z.number(),
        email: z.string().email().optional(),
        role: userRoleEnum.optional(),
        department: departmentEnum.optional().nullable(),
        managerId: z.number().optional().nullable(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const userRows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        const existingUser = userRows[0];
        if (!existingUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        const updates: Record<string, any> = {};
        if (input.email !== undefined) updates.email = input.email;
        if (input.role !== undefined) updates.role = input.role;
        if (input.department !== undefined) updates.department = input.department;
        if (input.managerId !== undefined) updates.managerId = input.managerId;
        if (input.isActive !== undefined) updates.isActive = input.isActive;
        if (Object.keys(updates).length === 0) return { success: false };

        const authUpdates: Record<string, unknown> = {};
        if (input.email !== undefined) authUpdates.email = input.email;
        if (input.isActive !== undefined) authUpdates.ban_duration = input.isActive ? "none" : "876000h";
        if (Object.keys(authUpdates).length > 0) {
          await getSupabaseAdmin().auth.admin.updateUserById(existingUser.openId, authUpdates);
        }

        await db.update(users).set(updates).where(eq(users.id, input.userId));
        await logAudit(ctx.user.id, "role_change", "user", input.userId, updates);
        return { success: true };
      }),
    getManagers: adminProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return [];
        return await db.select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.role, ["manager", "admin", "super_admin"]))
          .orderBy(users.name);
      }),
  }),
  // ─── Audit Logs (Admin) ───
  audit: router({
    recent: adminProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(auditLogs)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit);
      }),
  }),
});

export type AppRouter = typeof appRouter;
