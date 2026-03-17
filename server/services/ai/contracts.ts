import { z } from "zod";
import {
  DEFAULT_EVALUATION_RUBRIC,
  EVALUATION_DIMENSION_ORDER,
  normalizeEvaluationRubric,
  normalizeEvaluationScoreDimensions,
} from "../../../shared/evaluation-rubric";
import {
  normalizeLongitudinalProfile,
} from "../../../shared/longitudinal-profile";
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

const customerVoiceHintSchema = z.object({
  presentation: z.enum(["feminine", "masculine", "neutral"]).optional(),
  locale: z.string().trim().min(2).optional(),
  age_flavor: z.enum(["young_adult", "adult", "older_adult"]).optional(),
  notes: z.string().trim().min(1).max(160).optional(),
}).partial();

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
    voice_hint: customerVoiceHintSchema.optional(),
  }),
  situation_summary: z.string().trim().min(1),
  opening_line: z.string().trim().min(1),
  repeat_caller_key: z.string().trim().min(1).optional(),
  preserve_caller_voice: z.boolean().optional(),
  hidden_facts: z.array(z.string()).default([]),
  motive: z.string().trim().min(1).default("Get the real issue handled without being brushed off."),
  hidden_context: z.string().trim().min(1).default(""),
  personality_style: z.string().trim().min(1).default("Direct, ordinary, and human."),
  past_history: z.string().trim().min(1).default(""),
  pressure_context: z.string().trim().min(1).default(""),
  friction_points: z.array(z.string()).default([]),
  emotional_triggers: z.array(z.string()).default([]),
  likely_assumptions: z.array(z.string()).default([]),
  what_hearing_them_out_sounds_like: z.array(z.string()).default([]),
  credible_next_steps: z.array(z.string()).default([]),
  calm_down_if: z.array(z.string()).default([]),
  lose_trust_if: z.array(z.string()).default([]),
  approved_resolution_paths: z.array(z.string()).default([]),
  required_behaviors: z.array(z.string()).default([]),
  critical_errors: z.array(z.string()).default([]),
  branch_logic: scenarioBranchLogicSchema,
  emotion_progression: scenarioEmotionProgressionSchema,
  completion_rules: scenarioCompletionRulesSchema,
  completion_criteria: z.array(z.string()).default([]),
  failure_criteria: z.array(z.string()).default([]),
  recommended_turns: z.number().int().min(2).max(12).default(4),
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
  emotional_state: z.string().trim().min(1).default("concerned"),
  trust_level: z.number().int().min(0).max(10),
  issue_clarity: z.number().int().min(0).max(10),
  issue_complexity: z.number().int().min(0).max(10).default(4),
  clarification_depth: z.number().int().min(0).max(10).default(0),
  trust_damage_count: z.number().int().min(0).default(0),
  trust_recovery_count: z.number().int().min(0).default(0),
  unresolved_gap_count: z.number().int().min(0).default(0),
  misunderstood_turn_count: z.number().int().min(0).default(0),
  follow_up_question_count: z.number().int().min(0).default(0),
  resolution_momentum: z.number().int().min(0).max(10).default(0),
  no_progress_turns: z.number().int().min(0).default(0),
  stall_failure_risk: z.number().int().min(0).max(10).default(0),
  pacing_summary: z.string().default(""),
  initial_customer_complaint: z.string().trim().min(1).default(""),
  complaint_category: z.string().trim().min(1).default("general_service"),
  complaint_status: z.enum(["OPEN", "PARTIALLY_ADDRESSED", "REDIRECT_PENDING", "RESOLVED", "ESCALATED", "ABANDONED"]).default("OPEN"),
  complaint_still_open: z.boolean().default(false),
  current_customer_goal: z.string().trim().min(1).default(""),
  customer_belief_about_problem: z.string().trim().min(1).default(""),
  true_underlying_problem: z.string().trim().min(1).default(""),
  root_issue_status: z.enum(["UNRESOLVED", "PARTIALLY_ADDRESSED", "REDIRECT_PENDING", "RESOLVED", "ABANDONED"]).default("UNRESOLVED"),
  subissues_open: z.array(z.string()).default([]),
  discovered_facts: z.array(z.string()).default([]),
  false_customer_assumptions: z.array(z.string()).default([]),
  confirmed_business_facts: z.array(z.string()).default([]),
  resolution_requirements: z.array(z.string()).default([]),
  next_step_requirements: z.array(z.string()).default([]),
  escalation_requirements: z.array(z.string()).default([]),
  unresolved_subissues: z.array(z.string()).default([]),
  employee_promises_made: z.array(z.string()).default([]),
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
  customer_goal: z.string().trim().min(1).default("Move The Situation Forward"),
  goal_status: z.enum(["ACTIVE", "PARTIALLY_RESOLVED", "RESOLVED", "ESCALATED", "ABANDONED", "TIMED_OUT"]).default("ACTIVE"),
  issue_progress_state: z.enum(["ACTIVE", "PARTIALLY_RESOLVED", "RESOLVED", "ESCALATED", "ABANDONED", "TIMED_OUT"]).default("ACTIVE"),
  terminal_outcome_state: z.enum(["ACTIVE", "PARTIALLY_RESOLVED", "RESOLVED", "ESCALATED", "ABANDONED", "TIMED_OUT"]).default("ACTIVE"),
  terminal_validation_reason: z.string().default("Conversation is still active and cannot end yet."),
  completion_blockers: z.array(z.string()).default([]),
  accepted_next_step: z.boolean().default(false),
  next_step_owner: z.string().default(""),
  next_step_action: z.string().default(""),
  next_step_timeline: z.string().default(""),
  next_step_missing_fields: z.array(z.string()).default([]),
  valid_redirect: z.boolean().default(false),
  escalation_validity: z.enum(["invalid", "potential", "valid"]).default("invalid"),
  premature_closure_detected: z.boolean().default(false),
  unmet_completion_criteria: z.array(z.string()).default([]),
  unresolved_customer_questions: z.array(z.string()).default([]),
  unresolved_questions: z.array(z.string()).default([]),
  outcome_summary: z.string().default(""),
  patience_level: z.number().int().min(0).max(10).default(5),
  urgency_level: z.number().int().min(0).max(10).default(5),
  communication_style: z.string().trim().min(1).default("direct"),
  cooperation_level: z.number().int().min(0).max(10).default(5),
  offense_level: z.number().int().min(0).max(10).default(2),
  manager_request_level: z.number().int().min(0).max(10).default(1),
  resolution_confidence: z.number().int().min(0).max(10).default(1),
  confidence_in_employee: z.number().int().min(0).max(10).default(3),
  willingness_to_accept_redirect: z.number().int().min(0).max(10).default(3),
  willingness_to_escalate: z.number().int().min(0).max(10).default(2),
  customer_strategy: z.enum([
    "seek_acknowledgment",
    "seek_clarity",
    "seek_action",
    "seek_reassurance",
    "protect_dignity",
    "press_for_specifics",
    "request_manager",
    "follow_direction",
    "close_out",
  ]).default("seek_clarity"),
  likely_next_behavior: z.enum([
    "stay_engaged",
    "ask_follow_up",
    "become_cautious",
    "become_defensive",
    "request_manager",
    "disengage",
    "follow_instructions",
    "close_conversation",
  ]).default("stay_engaged"),
  emotional_shift_explanation: z.string().default(""),
  conversation_stage: z.enum(["opening", "fact_finding", "resolution", "escalation", "closure"]).default("opening"),
  analysis_summary: z.string().default(""),
  runtime_events: z.array(z.object({
    type: z.enum([
      "unresolved_complaint_persists",
      "complaint_partially_addressed",
      "complaint_fully_resolved",
      "next_step_offered",
      "next_step_rejected",
      "escalation_offered",
      "escalation_accepted",
      "premature_closure_attempted",
      "unresolved_gap_reopened",
      "timeout_failure",
      "abandonment_detected",
    ]),
    source: z.enum(["state_manager", "client", "live_runtime", "persistence"]),
    atTurn: z.number().int().min(0),
    summary: z.string().default(""),
    outcomeState: z.enum(["ACTIVE", "PARTIALLY_RESOLVED", "RESOLVED", "ESCALATED", "ABANDONED", "TIMED_OUT"]).optional(),
    unmetCriteria: z.array(z.string()).default([]),
    blockedBy: z.array(z.string()).default([]),
    prematureClosure: z.object({
      trigger_source: z.enum([
        "employee_transcript",
        "employee_wrap_up_language",
        "customer_reply_pattern",
        "runtime_end_trigger",
        "ui_auto_finish",
        "transcript_finalized",
      ]),
      trigger_phrase_or_reason: z.string().default(""),
      complaint_still_open: z.boolean().default(true),
      unresolved_gaps_snapshot: z.array(z.string()).default([]),
      trust_level_at_attempt: z.number().nullable().default(null),
      emotional_state_at_attempt: z.string().nullable().default(null),
      blocked: z.boolean().default(true),
      customer_strategy_at_attempt: z.string().nullable().optional(),
      likely_next_behavior_at_attempt: z.string().nullable().optional(),
    }).optional(),
  })).default([]),
  latest_employee_analysis: z.object({
    clarity: z.number().int().min(0).max(10).default(3),
    politeness: z.number().int().min(0).max(10).default(5),
    warmth: z.number().int().min(0).max(10).default(4),
    confidence: z.number().int().min(0).max(10).default(3),
    respectfulness: z.number().int().min(0).max(10).default(5),
    empathy: z.number().int().min(0).max(10).default(3),
    professionalism: z.number().int().min(0).max(10).default(4),
    helpfulness: z.number().int().min(0).max(10).default(3),
    accuracy: z.number().int().min(0).max(10).default(5),
    accuracyConfidence: z.number().int().min(0).max(10).default(4),
    ownership: z.number().int().min(0).max(10).default(3),
    directness: z.number().int().min(0).max(10).default(3),
    explanationQuality: z.number().int().min(0).max(10).default(3),
    nextStepQuality: z.number().int().min(0).max(10).default(3),
    respectImpact: z.number().int().min(-10).max(10).default(0),
    heardImpact: z.number().int().min(-10).max(10).default(0),
    escalationJudgment: z.number().int().min(0).max(10).default(5),
    toneLabels: z.array(z.string()).default([]),
    strengths: z.array(z.string()).default([]),
    issues: z.array(z.string()).default([]),
    serviceSummary: z.string().default(""),
    answeredQuestion: z.boolean().default(false),
    avoidedQuestion: z.boolean().default(false),
    soundedDismissive: z.boolean().default(false),
    soundedRude: z.boolean().default(false),
    setExpectationsClearly: z.boolean().default(false),
    tookOwnership: z.boolean().default(false),
    escalatedAppropriately: z.boolean().default(false),
    madeCustomerFeelHeard: z.boolean().default(false),
    contradictionDetected: z.boolean().default(false),
    vaguenessDetected: z.boolean().default(false),
    fakeConfidence: z.boolean().default(false),
    blameShifting: z.boolean().default(false),
    policyMisuse: z.boolean().default(false),
    overTalking: z.boolean().default(false),
    deadEndLanguage: z.boolean().default(false),
    disrespect: z.boolean().default(false),
    passiveAggression: z.boolean().default(false),
    roboticPhrasing: z.boolean().default(false),
    explicitManagerMention: z.boolean().default(false),
    explicitDisrespect: z.boolean().default(false),
    explicitOwnership: z.boolean().default(false),
    explicitNextStep: z.boolean().default(false),
    explicitTimeline: z.boolean().default(false),
    explicitVerification: z.boolean().default(false),
    explicitExplanation: z.boolean().default(false),
    explicitSafetyControl: z.boolean().default(false),
    explicitDirection: z.boolean().default(false),
    explicitDiscovery: z.boolean().default(false),
    explicitRecommendation: z.boolean().default(false),
    explicitClosureAttempt: z.boolean().default(false),
    likelySolved: z.boolean().default(false),
    likelyStalled: z.boolean().default(false),
    summary: z.string().default(""),
  }).default({
    clarity: 3,
    politeness: 5,
    warmth: 4,
    confidence: 3,
    respectfulness: 5,
    empathy: 3,
    professionalism: 4,
    helpfulness: 3,
    accuracy: 5,
    accuracyConfidence: 4,
    ownership: 3,
    directness: 3,
    explanationQuality: 3,
    nextStepQuality: 3,
    respectImpact: 0,
    heardImpact: 0,
    escalationJudgment: 5,
    toneLabels: [],
    strengths: [],
    issues: [],
    serviceSummary: "",
    answeredQuestion: false,
    avoidedQuestion: false,
    soundedDismissive: false,
    soundedRude: false,
    setExpectationsClearly: false,
    tookOwnership: false,
    escalatedAppropriately: false,
    madeCustomerFeelHeard: false,
    contradictionDetected: false,
    vaguenessDetected: false,
    fakeConfidence: false,
    blameShifting: false,
    policyMisuse: false,
    overTalking: false,
    deadEndLanguage: false,
    disrespect: false,
    passiveAggression: false,
    roboticPhrasing: false,
    explicitManagerMention: false,
    explicitDisrespect: false,
    explicitOwnership: false,
    explicitNextStep: false,
    explicitTimeline: false,
    explicitVerification: false,
    explicitExplanation: false,
    explicitSafetyControl: false,
    explicitDirection: false,
    explicitDiscovery: false,
    explicitRecommendation: false,
    explicitClosureAttempt: false,
    likelySolved: false,
    likelyStalled: false,
    summary: "",
  }),
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

const evaluationDimensionCapsSchema = z.object({
  member_connection: z.number().int().min(0).max(100).optional(),
  listening_discovery: z.number().int().min(0).max(100).optional(),
  ownership_accountability: z.number().int().min(0).max(100).optional(),
  problem_solving_policy: z.number().int().min(0).max(100).optional(),
  clarity_expectation_setting: z.number().int().min(0).max(100).optional(),
  resolution_control: z.number().int().min(0).max(100).optional(),
}).default({});

const evaluationScoreRubricBaseSchema = z.object({
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  dimension_order: z.array(z.enum(EVALUATION_DIMENSION_ORDER)).length(EVALUATION_DIMENSION_ORDER.length),
  dimension_weights: z.object({
    member_connection: z.number().int().min(0).max(100),
    listening_discovery: z.number().int().min(0).max(100),
    ownership_accountability: z.number().int().min(0).max(100),
    problem_solving_policy: z.number().int().min(0).max(100),
    clarity_expectation_setting: z.number().int().min(0).max(100),
    resolution_control: z.number().int().min(0).max(100),
  }),
  dimension_meta: z.object({
    member_connection: z.object({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      why_it_matters: z.string().trim().min(1),
    }),
    listening_discovery: z.object({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      why_it_matters: z.string().trim().min(1),
    }),
    ownership_accountability: z.object({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      why_it_matters: z.string().trim().min(1),
    }),
    problem_solving_policy: z.object({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      why_it_matters: z.string().trim().min(1),
    }),
    clarity_expectation_setting: z.object({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      why_it_matters: z.string().trim().min(1),
    }),
    resolution_control: z.object({
      label: z.string().trim().min(1),
      description: z.string().trim().min(1),
      why_it_matters: z.string().trim().min(1),
    }),
  }),
  overall_bands: z.array(z.object({
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
    min: z.number().int().min(0).max(100),
    max: z.number().int().min(0).max(100),
    summary: z.string().trim().min(1),
  })).min(1),
  hard_penalties: z.array(z.object({
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
    overall_cap: z.number().int().min(0).max(100).optional(),
    dimension_caps: evaluationDimensionCapsSchema.optional(),
  })).default([]),
  competency_signals: z.array(z.string().trim().min(1)).default([]),
}).superRefine((value, ctx) => {
  const total = value.dimension_weights.member_connection
    + value.dimension_weights.listening_discovery
    + value.dimension_weights.ownership_accountability
    + value.dimension_weights.problem_solving_policy
    + value.dimension_weights.clarity_expectation_setting
    + value.dimension_weights.resolution_control;

  if (total !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Rubric dimension weights must sum to 100, received ${total}.`,
      path: ["dimension_weights"],
    });
  }
});

export const evaluationScoreRubricSchema = z.preprocess(
  value => normalizeEvaluationRubric(value),
  evaluationScoreRubricBaseSchema,
);

const evaluationScoreDimensionsSchema = z.preprocess(
  value => normalizeEvaluationScoreDimensions(value),
  z.object({
    member_connection: z.number().int().min(0).max(100),
    listening_discovery: z.number().int().min(0).max(100),
    ownership_accountability: z.number().int().min(0).max(100),
    problem_solving_policy: z.number().int().min(0).max(100),
    clarity_expectation_setting: z.number().int().min(0).max(100),
    resolution_control: z.number().int().min(0).max(100),
  }),
);

export const evaluationResultSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  pass_fail: z.string().trim().min(1),
  readiness_signal: z.string().trim().min(1),
  category_scores: evaluationCategoryScoresSchema,
  score_dimensions: evaluationScoreDimensionsSchema.optional(),
  score_rubric: evaluationScoreRubricSchema.default(DEFAULT_EVALUATION_RUBRIC),
  applied_rubric_penalties: z.array(z.string()).default([]),
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

const longitudinalCompetencySignalSchema = z.object({
  score: z.number().int().min(0).max(100),
  trend: z.enum(["up", "steady", "down"]),
  summary: z.string().trim().min(1),
});

const longitudinalProfileSchema = z.preprocess(
  value => normalizeLongitudinalProfile(value),
  z.object({
    framework_name: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    stage_level: z.number().int().min(1).max(7),
    stage_label: z.string().trim().min(1),
    stage_summary: z.string().trim().min(1),
    confidence: z.enum(["emerging", "developing", "established"]),
    evidence_window_sessions: z.number().int().min(0),
    competencies: z.object({
      business_operations: longitudinalCompetencySignalSchema,
      drive_self_motivation: longitudinalCompetencySignalSchema,
      reliability_consistency: longitudinalCompetencySignalSchema,
      proactivity_initiative: longitudinalCompetencySignalSchema,
      work_ethic: longitudinalCompetencySignalSchema,
      problem_solving_adaptability: longitudinalCompetencySignalSchema,
      community_builder: longitudinalCompetencySignalSchema,
    }),
    development_priorities: z.array(z.string().trim().min(1)).default([]),
    manager_observation_focus: z.array(z.string().trim().min(1)).default([]),
  }),
);

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
  longitudinal_profile: longitudinalProfileSchema,
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
