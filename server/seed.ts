import "dotenv/config";
import { and, eq } from "drizzle-orm";
import {
  assignments,
  auditLogs,
  employeeProfiles,
  type InsertAssignment,
  type InsertAuditLog,
  type InsertEmployeeProfile,
  type InsertManagerReview,
  type InsertPolicyDocument,
  type InsertScenarioTemplate,
  type InsertSessionMedia,
  type InsertSimulationSession,
  type InsertUser,
  managerReviews,
  policyDocuments,
  scenarioTemplates,
  sessionMedia,
  simulationSessions,
  users,
} from "../drizzle/schema";
import { departmentRoles } from "../shared/wsc-content";
import { closeDb, getDb } from "./db";
import { WSC_POLICY_DOCUMENT_SEEDS, WSC_SCENARIO_TEMPLATE_SEEDS } from "./wsc-seed-data";
import { getSupabaseAdmin } from "./_core/supabase";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";

async function ensureAuthUser(input: {
  email: string;
  name: string;
  password?: string;
  isActive?: boolean;
}) {
  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new Error(`Failed to list Supabase auth users: ${error.message}`);
  }

  const existing = data.users.find((user) => user.email?.toLowerCase() === input.email.toLowerCase());

  if (existing) {
    const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(existing.id, {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        full_name: input.name,
      },
      ban_duration: input.isActive === false ? "876000h" : "none",
    });

    if (updateError) {
      throw new Error(`Failed to update Supabase auth user ${input.email}: ${updateError.message}`);
    }

    return existing.id;
  }

  const { data: created, error: createError } = await getSupabaseAdmin().auth.admin.createUser({
    email: input.email,
    password: input.password ?? ENV.seedUserPassword,
    email_confirm: true,
    user_metadata: {
      name: input.name,
      full_name: input.name,
    },
    ban_duration: input.isActive === false ? "876000h" : "none",
  });

  if (createError || !created.user) {
    throw new Error(`Failed to create Supabase auth user ${input.email}: ${createError?.message ?? "unknown error"}`);
  }

  return created.user.id;
}

async function ensureUser(input: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(users).where(eq(users.openId, input.openId)).limit(1);
  if (existing[0]) {
    await db.update(users).set({
      name: input.name ?? null,
      email: input.email ?? null,
      role: input.role,
      department: input.department ?? null,
      managerId: input.managerId ?? null,
      isActive: input.isActive ?? true,
      loginMethod: input.loginMethod ?? null,
      lastSignedIn: input.lastSignedIn ?? new Date(),
    }).where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(users).values(input as any).returning({ id: users.id });
  return result[0]?.id as number;
}

async function ensureProfile(userId: number, input: Omit<InsertEmployeeProfile, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1);
  if (existing[0]) {
    await db.update(employeeProfiles).set(input as any).where(eq(employeeProfiles.userId, userId));
    return existing[0].id;
  }

  const result = await db.insert(employeeProfiles).values({ userId, ...input } as any).returning({ id: employeeProfiles.id });
  return result[0]?.id as number;
}

async function ensureScenario(input: InsertScenarioTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(scenarioTemplates).where(eq(scenarioTemplates.title, input.title)).limit(1);
  if (existing[0]) {
    await db.update(scenarioTemplates).set(input as any).where(eq(scenarioTemplates.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(scenarioTemplates).values(input as any).returning({ id: scenarioTemplates.id });
  return result[0]?.id as number;
}

async function ensurePolicy(input: InsertPolicyDocument) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(policyDocuments).where(eq(policyDocuments.title, input.title)).limit(1);
  if (existing[0]) {
    await db.update(policyDocuments).set(input as any).where(eq(policyDocuments.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(policyDocuments).values(input as any).returning({ id: policyDocuments.id });
  return result[0]?.id as number;
}

async function ensureAssignment(input: InsertAssignment) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(assignments).where(and(
    eq(assignments.employeeId, input.employeeId),
    eq(assignments.title, input.title),
  )).limit(1);
  if (existing[0]) {
    await db.update(assignments).set(input as any).where(eq(assignments.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(assignments).values(input as any).returning({ id: assignments.id });
  return result[0]?.id as number;
}

async function ensureSession(input: InsertSimulationSession) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(simulationSessions).where(and(
    eq(simulationSessions.userId, input.userId),
    eq(simulationSessions.scenarioId, input.scenarioId),
  )).limit(1);
  if (existing[0]) {
    await db.update(simulationSessions).set(input as any).where(eq(simulationSessions.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(simulationSessions).values(input as any).returning({ id: simulationSessions.id });
  return result[0]?.id as number;
}

async function ensureSessionMedia(input: InsertSessionMedia) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(sessionMedia).where(and(
    eq(sessionMedia.sessionId, input.sessionId),
    eq(sessionMedia.storageKey, input.storageKey),
  )).limit(1);
  if (existing[0]) {
    await db.update(sessionMedia).set(input as any).where(eq(sessionMedia.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(sessionMedia).values(input as any).returning({ id: sessionMedia.id });
  return result[0]?.id as number;
}

async function ensureReview(input: InsertManagerReview) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const existing = await db.select().from(managerReviews).where(and(
    eq(managerReviews.sessionId, input.sessionId),
    eq(managerReviews.reviewerId, input.reviewerId),
  )).limit(1);
  if (existing[0]) {
    await db.update(managerReviews).set(input as any).where(eq(managerReviews.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(managerReviews).values(input as any).returning({ id: managerReviews.id });
  return result[0]?.id as number;
}

async function ensureAuditLog(input: InsertAuditLog) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed data");

  const result = await db.insert(auditLogs).values(input as any).returning({ id: auditLogs.id });
  return result[0]?.id as number;
}

async function seed() {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required to seed data");
  }

  console.log("Seeding Woodinville Sports Club MVP data...");

  const seedPassword = ENV.seedUserPassword;

  const superAdminAuthId = await ensureAuthUser({
    email: "alex.mercer@woodinvillesportsclub.local",
    name: "Alex Mercer",
    password: seedPassword,
    isActive: true,
  });

  const superAdminId = await ensureUser({
    openId: superAdminAuthId,
    name: "Alex Mercer",
    email: "alex.mercer@woodinvillesportsclub.local",
    role: "super_admin",
    department: null,
    isActive: true,
    loginMethod: "supabase_email",
    lastSignedIn: new Date(),
  });

  const managerAuthId = await ensureAuthUser({
    email: "dana.porter@woodinvillesportsclub.local",
    name: "Dana Porter",
    password: seedPassword,
    isActive: true,
  });

  const managerId = await ensureUser({
    openId: managerAuthId,
    name: "Dana Porter",
    email: "dana.porter@woodinvillesportsclub.local",
    role: "manager",
    department: "customer_service",
    isActive: true,
    loginMethod: "supabase_email",
    lastSignedIn: new Date(),
  });

  const shiftLeadAuthId = await ensureAuthUser({
    email: "taylor.chen@woodinvillesportsclub.local",
    name: "Taylor Chen",
    password: seedPassword,
    isActive: true,
  });

  const shiftLeadId = await ensureUser({
    openId: shiftLeadAuthId,
    name: "Taylor Chen",
    email: "taylor.chen@woodinvillesportsclub.local",
    role: "shift_lead",
    department: "customer_service",
    managerId,
    isActive: true,
    loginMethod: "supabase_email",
    lastSignedIn: new Date(),
  });

  const jamieAuthId = await ensureAuthUser({
    email: "jamie.alvarez@woodinvillesportsclub.local",
    name: "Jamie Alvarez",
    password: seedPassword,
    isActive: true,
  });

  const jamieId = await ensureUser({
    openId: jamieAuthId,
    name: "Jamie Alvarez",
    email: "jamie.alvarez@woodinvillesportsclub.local",
    role: "employee",
    department: "customer_service",
    managerId,
    isActive: true,
    loginMethod: "supabase_email",
    lastSignedIn: new Date(),
  });

  const rileyAuthId = await ensureAuthUser({
    email: "riley.morgan@woodinvillesportsclub.local",
    name: "Riley Morgan",
    password: seedPassword,
    isActive: true,
  });

  const rileyId = await ensureUser({
    openId: rileyAuthId,
    name: "Riley Morgan",
    email: "riley.morgan@woodinvillesportsclub.local",
    role: "employee",
    department: "golf",
    managerId,
    isActive: true,
    loginMethod: "supabase_email",
    lastSignedIn: new Date(),
  });

  const caseyAuthId = await ensureAuthUser({
    email: "casey.bennett@woodinvillesportsclub.local",
    name: "Casey Bennett",
    password: seedPassword,
    isActive: true,
  });

  const caseyId = await ensureUser({
    openId: caseyAuthId,
    name: "Casey Bennett",
    email: "casey.bennett@woodinvillesportsclub.local",
    role: "employee",
    department: "mod_emergency",
    managerId,
    isActive: true,
    loginMethod: "supabase_email",
    lastSignedIn: new Date(),
  });

  await ensureProfile(jamieId, {
    levelEstimate: "L2",
    readinessStatus: "partially_independent",
    trend: "improving",
    skillMap: {
      empathy: 8,
      clarity: 7,
      policy_accuracy: 8,
      ownership: 8,
      de_escalation: 7,
      escalation_judgment: 6,
      professional_presence: 8,
    },
    strongestFamilies: ["billing_confusion", "membership_question"],
    weakestFamilies: ["upset_parent", "reservation_issue"],
    pressureHandling: "steady",
    consistencyScore: 79,
    totalSessions: 5,
    averageScore: 81,
    managerAttentionFlag: false,
    managerNotes: "Ready for more independent front-desk reps once reservation recovery closes tighter.",
  });

  await ensureProfile(rileyId, {
    levelEstimate: "L1",
    readinessStatus: "shadow_ready",
    trend: "improving",
    skillMap: {
      empathy: 6,
      clarity: 7,
      policy_accuracy: 6,
      ownership: 6,
      de_escalation: 6,
      escalation_judgment: 6,
      professional_presence: 7,
    },
    strongestFamilies: ["lesson_inquiry"],
    weakestFamilies: ["hesitant_prospect", "value_explanation"],
    pressureHandling: "developing",
    consistencyScore: 71,
    totalSessions: 4,
    averageScore: 70,
    managerAttentionFlag: true,
    managerNotes: "Needs tighter discovery before moving into value explanation on live prospect conversations.",
  });

  await ensureProfile(caseyId, {
    levelEstimate: "L3",
    readinessStatus: "independent",
    trend: "improving",
    skillMap: {
      empathy: 8,
      clarity: 9,
      policy_accuracy: 9,
      ownership: 9,
      de_escalation: 8,
      escalation_judgment: 9,
      professional_presence: 9,
    },
    strongestFamilies: ["emergency_response", "unsafe_equipment_report"],
    weakestFamilies: ["power_interruption_confusion"],
    pressureHandling: "excellent",
    consistencyScore: 92,
    totalSessions: 7,
    averageScore: 90,
    managerAttentionFlag: false,
    managerNotes: "Strong MOD judgment. Use Casey as a peer model for emergency control language.",
  });

  const scenarioIdsByFamily: Record<string, number> = {};
  for (const template of WSC_SCENARIO_TEMPLATE_SEEDS) {
    const scenarioId = await ensureScenario({
      ...template,
      isActive: true,
      createdBy: superAdminId,
    } as any);
    scenarioIdsByFamily[template.scenarioFamily] = scenarioId;
  }

  const policyIds: number[] = [];
  for (const policy of WSC_POLICY_DOCUMENT_SEEDS) {
    const policyId = await ensurePolicy({
      ...policy,
      isActive: true,
      uploadedBy: superAdminId,
    } as any);
    policyIds.push(policyId);
  }

  const jamieAssignmentId = await ensureAssignment({
    employeeId: jamieId,
    assignedBy: managerId,
    scenarioTemplateId: scenarioIdsByFamily.reservation_issue,
    scenarioFamily: "reservation_issue",
    department: "customer_service",
    difficultyMin: 3,
    difficultyMax: 4,
    requiredAttempts: 1,
    completedAttempts: 0,
    status: "assigned",
    title: "Front desk reservation recovery",
    notes: "Own the scheduling miss fast and give one concrete alternative within the first two turns.",
  });

  const rileyAssignmentId = await ensureAssignment({
    employeeId: rileyId,
    assignedBy: managerId,
    scenarioTemplateId: scenarioIdsByFamily.value_explanation,
    scenarioFamily: "value_explanation",
    department: "golf",
    difficultyMin: 3,
    difficultyMax: 3,
    requiredAttempts: 1,
    completedAttempts: 1,
    status: "completed",
    title: "Golf value explanation live rep",
    notes: "Lead with discovery before you explain membership value.",
    completedAt: new Date(),
  });

  const caseyAssignmentId = await ensureAssignment({
    employeeId: caseyId,
    assignedBy: managerId,
    scenarioTemplateId: scenarioIdsByFamily.power_interruption_confusion,
    scenarioFamily: "power_interruption_confusion",
    department: "mod_emergency",
    difficultyMin: 4,
    difficultyMax: 5,
    requiredAttempts: 1,
    completedAttempts: 0,
    status: "assigned",
    title: "Power interruption member briefing",
    notes: "Keep updates factual. Do not guess at restoration timing.",
  });

  const jamieSessionId = await ensureSession({
    userId: jamieId,
    scenarioTemplateId: scenarioIdsByFamily.billing_confusion,
    scenarioId: "seed-frontdesk-billing-001",
    department: "customer_service",
    scenarioFamily: "billing_confusion",
    employeeRole: departmentRoles.customer_service,
    difficulty: 3,
    mode: "in_person",
    status: "completed",
    scenarioJson: {
      scenario_id: "seed-frontdesk-billing-001",
      department: "customer_service",
      employee_role: departmentRoles.customer_service,
      difficulty: 3,
      scenario_family: "billing_confusion",
    },
    transcript: [
      { role: "customer", message: "I’m seeing two different membership charges and nobody called me back.", emotion: "frustrated" },
      { role: "employee", message: "I can see why that would be frustrating. I’m going to verify which charge is valid and tell you the next update you will receive." },
      { role: "customer", message: "I don’t want another vague answer. What actually happens next?", emotion: "angry" },
      { role: "employee", message: "One draft is the family add-on and one appears to be the duplicate. I’m documenting a billing callback for today before 5 PM and noting that you already waited too long for follow-up." },
    ],
    stateHistory: [
      { turn_number: 1, emotion_state: "frustrated", trust_level: 3, issue_clarity: 5, employee_flags: { showed_empathy: true }, escalation_required: false, scenario_risk_level: "moderate" },
      { turn_number: 2, emotion_state: "calmer", trust_level: 6, issue_clarity: 8, employee_flags: { showed_empathy: true, took_ownership: true, answered_directly: true }, escalation_required: false, scenario_risk_level: "moderate" },
    ],
    turnCount: 4,
    policyGrounding: {
      policy_accuracy: "correct",
      matched_policy_points: ["Verified before promising", "Named the next update timing"],
      missed_policy_points: [],
      invented_or_risky_statements: [],
      should_have_escalated: false,
      policy_notes: "Aligned with front desk billing standards.",
    },
    evaluationResult: {
      overall_score: 84,
      pass_fail: "pass",
      readiness_signal: "partially_independent",
      category_scores: {
        opening_warmth: 8,
        listening_empathy: 8,
        clarity_directness: 8,
        policy_accuracy: 8,
        ownership: 9,
        problem_solving: 8,
        de_escalation: 7,
        escalation_judgment: 7,
        visible_professionalism: 8,
        closing_control: 8,
      },
      best_moments: ["Owned the missed callback", "Explained the next update clearly"],
      missed_moments: ["Could have restated the exact callback owner sooner"],
      critical_mistakes: [],
      coachable_mistakes: ["Tighten the close by naming the callback owner immediately"],
      most_important_correction: "Close with the owner and time in one sentence.",
      ideal_response_example: "I’ve verified the duplicate draft, and I’m logging a billing callback for you today before 5 PM so you know exactly when the next update is coming.",
      summary: "Solid front-desk ownership with a clear correction on closing control.",
    },
    coachingResult: {
      employee_coaching_summary: "Strong ownership. Tighten the close so the member hears who owns the next step and when it will happen.",
      what_you_did_well: ["Acknowledged the frustration quickly", "Explained the charge issue without guessing"],
      what_hurt_you: ["The callback owner came a little late in the answer"],
      do_this_next_time: ["State the owner and time in the same sentence", "Do not wait until the end of the response to name follow-up"],
      replacement_phrases: ["I’m logging this for billing now, and you will get the next update from us today before 5 PM."],
      practice_focus: "closing_control",
      next_recommended_scenario: "reservation_issue",
    },
    managerDebrief: {
      manager_summary: "Jamie is usable on front-desk billing issues. One more correction on closing control before fully independent reservation recovery.",
      performance_signal: "green",
      top_strengths: ["Ownership", "Policy accuracy"],
      top_corrections: ["Name the follow-up owner earlier"],
      whether_live_shadowing_is_needed: false,
      whether_manager_follow_up_is_needed: false,
      recommended_follow_up_action: "Assign one reservation issue drill with emphasis on fast alternatives and a clean close.",
      recommended_next_drill: "reservation_issue",
    },
    sessionQuality: "usable",
    lowEffortResult: { session_quality: "usable", flags: [], reason: "Specific, complete interaction.", retry_recommended: false },
    overallScore: 84,
    passFail: "pass",
    readinessSignal: "partially_independent",
    categoryScores: {
      opening_warmth: 8,
      listening_empathy: 8,
      clarity_directness: 8,
      policy_accuracy: 8,
      ownership: 9,
      problem_solving: 8,
      de_escalation: 7,
      escalation_judgment: 7,
      visible_professionalism: 8,
      closing_control: 8,
    },
    reviewStatus: "pending",
    completedAt: new Date(),
  });

  const rileySessionId = await ensureSession({
    userId: rileyId,
    scenarioTemplateId: scenarioIdsByFamily.value_explanation,
    assignmentId: rileyAssignmentId,
    scenarioId: "seed-golf-live-001",
    department: "golf",
    scenarioFamily: "value_explanation",
    employeeRole: departmentRoles.golf,
    difficulty: 3,
    mode: "live_voice",
    status: "completed",
    scenarioJson: {
      scenario_id: "seed-golf-live-001",
      department: "golf",
      employee_role: departmentRoles.golf,
      difficulty: 3,
      scenario_family: "value_explanation",
    },
    transcript: [
      { role: "customer", message: "I’m not looking for a pitch. Tell me why this place actually fits someone like me.", emotion: "skeptical" },
      { role: "employee", message: "Before I answer that, how often do you play and what matters most to you when you choose where to practice and play?" },
      { role: "customer", message: "Twice a week, mostly early mornings, and I care about practice access more than prestige.", emotion: "neutral" },
      { role: "employee", message: "That helps. For someone using the range and practice areas consistently, the value shows up in reliable access and a cleaner routine, not just a nicer sales pitch. The next step I’d suggest is a trial visit focused on those practice windows." },
    ],
    turnEvents: [
      { type: "response.create", source: "system", atMs: 310, payload: { modalities: ["audio", "text"] } },
      { type: "conversation.item.input_audio_transcription.completed", source: "system", atMs: 4200 },
      { type: "response.audio_transcript.done", source: "system", atMs: 6900 },
      { type: "conversation.item.input_audio_transcription.completed", source: "system", atMs: 12200 },
      { type: "response.audio_transcript.done", source: "system", atMs: 16100 },
    ],
    timingMarkers: [
      { name: "call_requested", atMs: 0 },
      { name: "microphone_ready", atMs: 210 },
      { name: "credential_received", atMs: 420 },
      { name: "peer_connected", atMs: 1380 },
      { name: "data_channel_open", atMs: 1475 },
      { name: "call_ended", atMs: 18500 },
    ],
    stateHistory: [
      { turn_number: 1, emotion_state: "skeptical", trust_level: 4, issue_clarity: 5, employee_flags: { answered_directly: true }, escalation_required: false, scenario_risk_level: "low" },
      { turn_number: 2, emotion_state: "interested", trust_level: 7, issue_clarity: 8, employee_flags: { answered_directly: true, took_ownership: true }, escalation_required: false, scenario_risk_level: "low" },
    ],
    turnCount: 4,
    policyGrounding: {
      policy_accuracy: "correct",
      matched_policy_points: ["Used discovery before pitching value", "Did not invent pricing"],
      missed_policy_points: [],
      invented_or_risky_statements: [],
      should_have_escalated: false,
      policy_notes: "Aligned with golf discovery and value positioning standards.",
    },
    evaluationResult: {
      overall_score: 74,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {
        opening_warmth: 7,
        listening_empathy: 7,
        clarity_directness: 8,
        policy_accuracy: 7,
        ownership: 7,
        problem_solving: 7,
        de_escalation: 7,
        escalation_judgment: 7,
        visible_professionalism: 7,
        closing_control: 6,
      },
      best_moments: ["Opened with discovery instead of a pitch", "Connected value to actual usage"],
      missed_moments: ["Close could have been more decisive on the next step"],
      critical_mistakes: [],
      coachable_mistakes: ["Offer the trial or next appointment more directly"],
      most_important_correction: "Finish the value explanation with a firmer next step.",
      ideal_response_example: "Based on how often you practice, I’d show you a trial window built around those early-morning range sessions so you can test the fit directly.",
      summary: "Good recovery from skepticism, but the close still needs more sales-service confidence.",
    },
    coachingResult: {
      employee_coaching_summary: "This was better because you led with discovery. The next jump is to close the conversation with a firmer next step instead of softening the recommendation.",
      what_you_did_well: ["Asked a useful discovery question first", "Made the value explanation relevant"],
      what_hurt_you: ["The close did not sound decisive enough"],
      do_this_next_time: ["Recommend the next step directly", "Stop softening the close with extra explanation once the fit is clear"],
      replacement_phrases: ["Based on what you told me, the right next step is a trial visit focused on your early-morning practice routine."],
      practice_focus: "closing_control",
      next_recommended_scenario: "hesitant_prospect",
    },
    managerDebrief: {
      manager_summary: "Riley is improving on live prospect conversations. Discovery was solid; closing confidence still needs coached reps before independent tour conversion work.",
      performance_signal: "yellow",
      top_strengths: ["Discovery-led opening", "Relevant value explanation"],
      top_corrections: ["Make the next step sound more decisive"],
      whether_live_shadowing_is_needed: true,
      whether_manager_follow_up_is_needed: true,
      recommended_follow_up_action: "Run one coached live shadow on a prospect walk-through and then repeat the drill.",
      recommended_next_drill: "hesitant_prospect",
    },
    sessionQuality: "usable",
    lowEffortResult: { session_quality: "usable", flags: [], reason: "Complete live transcript with useful signal.", retry_recommended: false },
    overallScore: 74,
    passFail: "borderline",
    readinessSignal: "shadow_ready",
    categoryScores: {
      opening_warmth: 7,
      listening_empathy: 7,
      clarity_directness: 8,
      policy_accuracy: 7,
      ownership: 7,
      problem_solving: 7,
      de_escalation: 7,
      escalation_judgment: 7,
      visible_professionalism: 7,
      closing_control: 6,
    },
    reviewStatus: "overridden",
    completedAt: new Date(),
  });

  const caseySessionId = await ensureSession({
    userId: caseyId,
    scenarioTemplateId: scenarioIdsByFamily.emergency_response,
    scenarioId: "seed-mod-emergency-001",
    department: "mod_emergency",
    scenarioFamily: "emergency_response",
    employeeRole: departmentRoles.mod_emergency,
    difficulty: 5,
    mode: "async_video",
    status: "completed",
    scenarioJson: {
      scenario_id: "seed-mod-emergency-001",
      department: "mod_emergency",
      employee_role: departmentRoles.mod_emergency,
      difficulty: 5,
      scenario_family: "emergency_response",
    },
    transcript: [
      { role: "customer", message: "Someone collapsed near the cardio area. I need a manager now.", emotion: "panicked" },
      { role: "employee", message: "I’m the Manager on Duty. Emergency response is moving now. Stay with me for one second: is the person breathing and is anyone with them already?" },
      { role: "customer", message: "Yes, another member is with them, but people are starting to crowd around.", emotion: "panicked" },
      { role: "employee", message: "Thank you. Keep that area clear, and I’m sending support now while I start the incident response and internal escalation." },
    ],
    stateHistory: [
      { turn_number: 1, emotion_state: "panicked", trust_level: 3, issue_clarity: 7, employee_flags: { took_ownership: true }, escalation_required: true, scenario_risk_level: "high" },
      { turn_number: 2, emotion_state: "concerned", trust_level: 7, issue_clarity: 9, employee_flags: { took_ownership: true, answered_directly: true, used_correct_policy: true }, escalation_required: true, scenario_risk_level: "high" },
    ],
    turnCount: 4,
    policyGrounding: {
      policy_accuracy: "correct",
      matched_policy_points: ["Prioritized emergency response", "Directed scene control", "Escalated internally"],
      missed_policy_points: [],
      invented_or_risky_statements: [],
      should_have_escalated: true,
      policy_notes: "Handled as a true MOD emergency response.",
    },
    evaluationResult: {
      overall_score: 93,
      pass_fail: "pass",
      readiness_signal: "independent",
      category_scores: {
        opening_warmth: 8,
        listening_empathy: 9,
        clarity_directness: 9,
        policy_accuracy: 10,
        ownership: 10,
        problem_solving: 9,
        de_escalation: 8,
        escalation_judgment: 10,
        visible_professionalism: 9,
        closing_control: 9,
      },
      best_moments: ["Took control immediately", "Directed the witness clearly without overexplaining"],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "None. Keep the same clarity under pressure.",
      ideal_response_example: "Emergency response is moving now. Keep the area clear, stay with the person, and I’m activating the internal response immediately.",
      summary: "Strong MOD emergency control with decisive, policy-aligned communication.",
    },
    coachingResult: {
      employee_coaching_summary: "Strong emergency control. Keep using short direction-first language under pressure.",
      what_you_did_well: ["Led with response action", "Gave useful scene-control direction"],
      what_hurt_you: [],
      do_this_next_time: ["Keep the same structure when the scene is chaotic"],
      replacement_phrases: ["Emergency response is moving now. Keep the area clear while I activate the next step."],
      practice_focus: "pressure_control",
      next_recommended_scenario: "power_interruption_confusion",
    },
    managerDebrief: {
      manager_summary: "Casey is operating at independent MOD level on emergency response. Strong candidate to model concise scene-control language for other leaders.",
      performance_signal: "green",
      top_strengths: ["Escalation judgment", "Control under pressure"],
      top_corrections: [],
      whether_live_shadowing_is_needed: false,
      whether_manager_follow_up_is_needed: false,
      recommended_follow_up_action: "Use this session as a benchmark clip for MOD coaching.",
      recommended_next_drill: "power_interruption_confusion",
    },
    sessionQuality: "usable",
    lowEffortResult: { session_quality: "usable", flags: [], reason: "High-signal emergency transcript.", retry_recommended: false },
    overallScore: 93,
    passFail: "pass",
    readinessSignal: "independent",
    categoryScores: {
      opening_warmth: 8,
      listening_empathy: 9,
      clarity_directness: 9,
      policy_accuracy: 10,
      ownership: 10,
      problem_solving: 9,
      de_escalation: 8,
      escalation_judgment: 10,
      visible_professionalism: 9,
      closing_control: 9,
    },
    reviewStatus: "reviewed",
    completedAt: new Date(),
  });

  const jamieReplay = await storagePut(
    "seed/frontdesk-billing-review.txt",
    "Front desk replay placeholder for billing confusion review.\nUse the transcript and scored result tabs for the full coaching context.",
    "text/plain",
    "session-media",
  );

  await ensureSessionMedia({
    sessionId: jamieSessionId,
    userId: jamieId,
    mediaType: "transcript_file",
    storageUrl: jamieReplay.url,
    storageKey: jamieReplay.key,
    mimeType: "text/plain",
    fileSizeBytes: 118,
  });

  const caseyReplay = await storagePut(
    "seed/mod-emergency-response.txt",
    "MOD emergency response replay placeholder.\nAudio was not bundled with the seed. Review the live transcript, timing markers, and evaluation instead.",
    "text/plain",
    "session-media",
  );

  await ensureSessionMedia({
    sessionId: caseySessionId,
    userId: caseyId,
    mediaType: "transcript_file",
    storageUrl: caseyReplay.url,
    storageKey: caseyReplay.key,
    mimeType: "text/plain",
    fileSizeBytes: 133,
  });

  await ensureReview({
    sessionId: rileySessionId,
    reviewerId: managerId,
    employeeId: rileyId,
    originalScore: 74,
    overrideScore: 78,
    scoreDelta: 4,
    overrideReason: "The live call showed stronger discovery discipline than the model credited, but the close still needs work.",
    managerNotes: "Coach Riley to stop softening the recommendation once fit is clear.",
    performanceSignal: "yellow",
    followUpRequired: true,
    followUpAction: "Shadow one prospect conversation this week and repeat the drill.",
    shadowingNeeded: true,
    assignedNextDrillTemplateId: scenarioIdsByFamily.hesitant_prospect,
    assignedNextDrill: "hesitant_prospect",
    status: "overridden",
  });

  await ensureReview({
    sessionId: caseySessionId,
    reviewerId: managerId,
    employeeId: caseyId,
    originalScore: 93,
    managerNotes: "Keep Casey in the benchmark set for MOD emergency response coaching.",
    performanceSignal: "green",
    followUpRequired: false,
    followUpAction: "No follow-up needed.",
    shadowingNeeded: false,
    status: "reviewed",
  });

  await ensureAuditLog({
    userId: managerId,
    action: "score_override",
    targetType: "session",
    targetId: rileySessionId,
    details: { from: 74, to: 78, reason: "Discovery quality stronger than model score" },
  });

  await ensureAuditLog({
    userId: superAdminId,
    action: "role_change",
    targetType: "user",
    targetId: shiftLeadId,
    details: { created: true, role: "shift_lead", department: "customer_service" },
  });

  await ensureAuditLog({
    userId: superAdminId,
    action: "policy_upload",
    targetType: "policy_document",
    targetId: policyIds[0],
    details: { seeded: true, title: WSC_POLICY_DOCUMENT_SEEDS[0].title },
  });

  console.log("Seed complete.");
  console.log(`Users: ${[superAdminId, managerId, shiftLeadId, jamieId, rileyId, caseyId].length}`);
  console.log(`Policies: ${policyIds.length}`);
  console.log(`Scenarios: ${WSC_SCENARIO_TEMPLATE_SEEDS.length}`);
  console.log(`Sessions: ${[jamieSessionId, rileySessionId, caseySessionId].length}`);
  console.log(`Assignments: ${[jamieAssignmentId, rileyAssignmentId, caseyAssignmentId].length}`);
  console.log(`Seed sign-in password: ${seedPassword}`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
