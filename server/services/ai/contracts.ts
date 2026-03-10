import { z } from "zod";
import {
  adaptiveDifficultySchema as adaptiveDifficultyResponseFormat,
  customerReplySchema as customerReplyResponseFormat,
  employeeCoachSchema as employeeCoachResponseFormat,
  evaluatorSchema as evaluatorResponseFormat,
  managerDebriefSchema as managerDebriefResponseFormat,
  policyGroundingSchema as policyGroundingResponseFormat,
  profileUpdateSchema as profileUpdateResponseFormat,
  scenarioDirectorSchema as scenarioDirectorResponseFormat,
  sessionQualitySchema as sessionQualityResponseFormat,
  stateManagerSchema as stateManagerResponseFormat,
} from "../../schemas";

const transcriptRoleSchema = z.enum(["customer", "employee"]);

export const transcriptTurnSchema = z.object({
  role: transcriptRoleSchema,
  message: z.string().trim().min(1),
  emotion: z.string().trim().min(1).optional(),
  timestamp: z.number().optional(),
});

export const transcriptSchema = z.array(transcriptTurnSchema);

export const timingMarkerSchema = z.object({
  name: z.string().trim().min(1),
  atMs: z.number().int().min(0),
  detail: z.string().optional(),
});

export const turnEventSchema = z.object({
  type: z.string().trim().min(1),
  source: z.enum(["system", "employee", "customer"]),
  atMs: z.number().int().min(0),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const booleanFlagRecordSchema = z.record(z.string(), z.boolean());

const scenarioBranchLogicSchema = z.object({
  if_empathy_is_strong: z.string().default("Customer becomes easier to help."),
  if_answer_is_vague: z.string().default("Customer grows more skeptical."),
  if_policy_is_wrong: z.string().default("Customer asks for a manager."),
  if_employee_takes_ownership: z.string().default("Customer starts to trust the employee."),
  if_employee_fails_to_help: z.string().default("Customer escalates frustration."),
  if_employee_escalates_correctly: z.string().default("Customer accepts the handoff."),
}).partial().transform(value => ({
  if_empathy_is_strong: value.if_empathy_is_strong ?? "Customer becomes easier to help.",
  if_answer_is_vague: value.if_answer_is_vague ?? "Customer grows more skeptical.",
  if_policy_is_wrong: value.if_policy_is_wrong ?? "Customer asks for a manager.",
  if_employee_takes_ownership: value.if_employee_takes_ownership ?? "Customer starts to trust the employee.",
  if_employee_fails_to_help: value.if_employee_fails_to_help ?? "Customer escalates frustration.",
  if_employee_escalates_correctly: value.if_employee_escalates_correctly ?? "Customer accepts the handoff.",
}));

const scenarioEmotionProgressionSchema = z.object({
  starting_state: z.string().default("frustrated"),
  better_if: z.array(z.string()).default([]),
  worse_if: z.array(z.string()).default([]),
}).partial().transform(value => ({
  starting_state: value.starting_state ?? "frustrated",
  better_if: value.better_if ?? [],
  worse_if: value.worse_if ?? [],
}));

const scenarioCompletionRulesSchema = z.object({
  resolved_if: z.array(z.string()).default([]),
  end_early_if: z.array(z.string()).default([]),
  manager_required_if: z.array(z.string()).default([]),
}).partial().transform(value => ({
  resolved_if: value.resolved_if ?? [],
  end_early_if: value.end_early_if ?? [],
  manager_required_if: value.manager_required_if ?? [],
}));

export const scenarioDirectorResultSchema = z.object({
  scenario_id: z.string().trim().min(1),
  department: z.string().trim().min(1),
  employee_role: z.string().trim().min(1),
  difficulty: z.number().int().min(1).max(5),
  scenario_family: z.string().trim().min(1),
  customer_persona: z.object({
    name: z.string().trim().min(1),
    age_band: z.string().trim().min(1),
    membership_context: z.string().trim().min(1),
    communication_style: z.string().trim().min(1),
    initial_emotion: z.string().trim().min(1),
    patience_level: z.string().trim().min(1),
  }),
  situation_summary: z.string().trim().min(1),
  opening_line: z.string().trim().min(1),
  hidden_facts: z.array(z.string()).default([]),
  approved_resolution_paths: z.array(z.string()).default([]),
  required_behaviors: z.array(z.string()).default([]),
  critical_errors: z.array(z.string()).default([]),
  branch_logic: scenarioBranchLogicSchema,
  emotion_progression: scenarioEmotionProgressionSchema,
  completion_rules: scenarioCompletionRulesSchema,
  recommended_turns: z.number().int().min(3).max(5).default(4),
});

export const customerReplyResultSchema = z.object({
  customer_reply: z.string().trim().min(1),
  updated_emotion: z.string().trim().min(1),
  trust_level: z.number().int().min(0).max(10),
  issue_clarity: z.number().int().min(0).max(10),
  manager_needed: z.boolean(),
  scenario_complete: z.boolean(),
  completion_reason: z.string().default(""),
  new_hidden_fact_revealed: z.string().default(""),
  director_notes: z.object({
    employee_showed_empathy: z.boolean(),
    employee_was_clear: z.boolean(),
    employee_used_correct_policy: z.boolean(),
    employee_took_ownership: z.boolean(),
    employee_should_be_pushed_harder: z.boolean(),
  }),
});

export const stateUpdateResultSchema = z.object({
  turn_number: z.number().int().min(1),
  emotion_state: z.string().trim().min(1),
  trust_level: z.number().int().min(0).max(10),
  issue_clarity: z.number().int().min(0).max(10),
  employee_flags: z.object({
    showed_empathy: z.boolean(),
    answered_directly: z.boolean(),
    used_correct_policy: z.boolean(),
    took_ownership: z.boolean(),
    avoided_question: z.boolean(),
    critical_error: z.boolean(),
  }).or(booleanFlagRecordSchema).transform(flags => ({
    showed_empathy: flags.showed_empathy ?? false,
    answered_directly: flags.answered_directly ?? false,
    used_correct_policy: flags.used_correct_policy ?? false,
    took_ownership: flags.took_ownership ?? false,
    avoided_question: flags.avoided_question ?? false,
    critical_error: flags.critical_error ?? false,
  })),
  escalation_required: z.boolean(),
  scenario_risk_level: z.string().trim().min(1),
  continue_simulation: z.boolean().default(true),
});

export const policyGroundingResultSchema = z.object({
  policy_accuracy: z.string().trim().min(1),
  matched_policy_points: z.array(z.string()).default([]),
  missed_policy_points: z.array(z.string()).default([]),
  invented_or_risky_statements: z.array(z.string()).default([]),
  should_have_escalated: z.boolean(),
  policy_notes: z.string().default(""),
});

export const visibleBehaviorResultSchema = z.object({
  assessment_status: z.enum(["not_available", "valid", "invalid_media"]),
  usable_for_scoring: z.boolean(),
  flags: z.array(z.string()).default([]),
  summary: z.string().default(""),
  observed_behaviors: z.object({
    camera_engagement: z.number().int().min(0).max(10),
    attentiveness: z.number().int().min(0).max(10),
    composure: z.number().int().min(0).max(10),
    pacing: z.number().int().min(0).max(10),
    interruptions: z.number().int().min(0).max(10),
    professional_delivery: z.number().int().min(0).max(10),
  }).optional(),
  retry_recommended: z.boolean(),
});

export const sessionQualityResultSchema = z.object({
  session_quality: z.string().trim().min(1),
  flags: z.array(z.string()).default([]),
  reason: z.string().default(""),
  retry_recommended: z.boolean(),
});

export const evaluationCategoryScoresSchema = z.object({
  opening_warmth: z.number().int().min(0).max(10).default(0),
  listening_empathy: z.number().int().min(0).max(10).default(0),
  clarity_directness: z.number().int().min(0).max(10).default(0),
  policy_accuracy: z.number().int().min(0).max(10).default(0),
  ownership: z.number().int().min(0).max(10).default(0),
  problem_solving: z.number().int().min(0).max(10).default(0),
  de_escalation: z.number().int().min(0).max(10).default(0),
  escalation_judgment: z.number().int().min(0).max(10).default(0),
  visible_professionalism: z.number().int().min(0).max(10).default(0),
  closing_control: z.number().int().min(0).max(10).default(0),
}).partial().transform(value => ({
  opening_warmth: value.opening_warmth ?? 0,
  listening_empathy: value.listening_empathy ?? 0,
  clarity_directness: value.clarity_directness ?? 0,
  policy_accuracy: value.policy_accuracy ?? 0,
  ownership: value.ownership ?? 0,
  problem_solving: value.problem_solving ?? 0,
  de_escalation: value.de_escalation ?? 0,
  escalation_judgment: value.escalation_judgment ?? 0,
  visible_professionalism: value.visible_professionalism ?? 0,
  closing_control: value.closing_control ?? 0,
}));

export const evaluationResultSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  pass_fail: z.string().trim().min(1),
  readiness_signal: z.string().trim().min(1),
  category_scores: evaluationCategoryScoresSchema,
  best_moments: z.array(z.string()).default([]),
  missed_moments: z.array(z.string()).default([]),
  critical_mistakes: z.array(z.string()).default([]),
  coachable_mistakes: z.array(z.string()).default([]),
  most_important_correction: z.string().default(""),
  ideal_response_example: z.string().default(""),
  summary: z.string().default(""),
});

const replacementPhraseSchema = z.union([
  z.string(),
  z.object({ original: z.string(), better: z.string() }).transform(value => value.better),
]);

export const coachingResultSchema = z.object({
  employee_coaching_summary: z.string().default(""),
  what_you_did_well: z.array(z.string()).default([]),
  what_hurt_you: z.array(z.string()).default([]),
  do_this_next_time: z.array(z.string()).default([]),
  replacement_phrases: z.array(replacementPhraseSchema).default([]),
  practice_focus: z.string().default(""),
  next_recommended_scenario: z.string().default(""),
});

export const managerDebriefResultSchema = z.object({
  manager_summary: z.string().default(""),
  performance_signal: z.enum(["green", "yellow", "red"]),
  top_strengths: z.array(z.string()).default([]),
  top_corrections: z.array(z.string()).default([]),
  whether_live_shadowing_is_needed: z.boolean(),
  whether_manager_follow_up_is_needed: z.boolean(),
  recommended_follow_up_action: z.string().default(""),
  recommended_next_drill: z.string().default(""),
});

export const profileUpdateResultSchema = z.object({
  level_estimate: z.string().trim().min(1),
  readiness_status: z.string().trim().min(1),
  trend: z.string().trim().min(1),
  skill_map: z.object({
    empathy: z.number().int().min(0).max(10),
    clarity: z.number().int().min(0).max(10),
    policy_accuracy: z.number().int().min(0).max(10),
    ownership: z.number().int().min(0).max(10),
    de_escalation: z.number().int().min(0).max(10),
    escalation_judgment: z.number().int().min(0).max(10),
    professional_presence: z.number().int().min(0).max(10),
  }),
  strongest_scenario_families: z.array(z.string()).default([]),
  weakest_scenario_families: z.array(z.string()).default([]),
  pressure_handling: z.string().default(""),
  consistency_score: z.number().int().min(0).max(100),
  recommended_next_steps: z.array(z.string()).default([]),
  manager_attention_flag: z.boolean(),
});

export const adaptiveDifficultyResultSchema = z.object({
  next_difficulty: z.number().int().min(1).max(5).default(3),
  difficulty_reason: z.string().default(""),
  recommended_scenario_family: z.string().default(""),
  recommended_emotional_intensity: z.string().default("moderate"),
  recommended_complexity: z.string().default("mixed"),
});

export const mediaInputSchema = z.object({
  mediaType: z.enum(["video", "audio", "transcript_file"]),
  storageUrl: z.string().trim().min(1),
  mimeType: z.string().trim().optional(),
  durationSeconds: z.number().int().nonnegative().optional().nullable(),
  turnNumber: z.number().int().min(1).optional().nullable(),
});

export const stateHistorySchema = z.array(stateUpdateResultSchema);

export const aiStructuredPersistenceSchema = z.object({
  transcript: z.unknown().transform(value => {
    const parsed = transcriptSchema.safeParse(value);
    return parsed.success ? parsed.data : [];
  }),
  stateHistory: z.unknown().transform(value => {
    const parsed = stateHistorySchema.safeParse(value);
    return parsed.success ? parsed.data : [];
  }),
  policyGrounding: z.unknown().optional().transform(value => value === undefined ? undefined : policyGroundingResultSchema.parse(value)),
  visibleBehavior: z.unknown().optional().transform(value => value === undefined ? undefined : visibleBehaviorResultSchema.parse(value)),
  evaluationResult: z.unknown().optional().transform(value => value === undefined ? undefined : evaluationResultSchema.parse(value)),
  coachingResult: z.unknown().optional().transform(value => value === undefined ? undefined : coachingResultSchema.parse(value)),
  managerDebrief: z.unknown().optional().transform(value => value === undefined ? undefined : managerDebriefResultSchema.parse(value)),
  lowEffortResult: z.unknown().optional().transform(value => value === undefined ? undefined : sessionQualityResultSchema.parse(value)),
});

export const timingMarkersSchema = z.array(timingMarkerSchema);
export const turnEventsSchema = z.array(turnEventSchema);

export type ScenarioDirectorResult = z.infer<typeof scenarioDirectorResultSchema>;
export type CustomerReplyResult = z.infer<typeof customerReplyResultSchema>;
export type StateUpdateResult = z.infer<typeof stateUpdateResultSchema>;
export type PolicyGroundingResult = z.infer<typeof policyGroundingResultSchema>;
export type VisibleBehaviorResult = z.infer<typeof visibleBehaviorResultSchema>;
export type SessionQualityResult = z.infer<typeof sessionQualityResultSchema>;
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
export type CoachingResult = z.infer<typeof coachingResultSchema>;
export type ManagerDebriefResult = z.infer<typeof managerDebriefResultSchema>;
export type ProfileUpdateResult = z.infer<typeof profileUpdateResultSchema>;
export type AdaptiveDifficultyResult = z.infer<typeof adaptiveDifficultyResultSchema>;
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;
export type MediaInput = z.infer<typeof mediaInputSchema>;
export type TimingMarker = z.infer<typeof timingMarkerSchema>;
export type TurnEvent = z.infer<typeof turnEventSchema>;

export const responseFormats = {
  scenarioDirector: scenarioDirectorResponseFormat,
  statefulCustomerActor: customerReplyResponseFormat,
  conversationStateUpdater: stateManagerResponseFormat,
  policyGrounding: policyGroundingResponseFormat,
  interactionEvaluator: evaluatorResponseFormat,
  coachingGenerator: employeeCoachResponseFormat,
  managerDebriefGenerator: managerDebriefResponseFormat,
  lowEffortDetector: sessionQualityResponseFormat,
  employeeProfileUpdater: profileUpdateResponseFormat,
  adaptiveDifficultyEngine: adaptiveDifficultyResponseFormat,
} as const;
