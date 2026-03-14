export type CustomerGoalStatus = "ACTIVE" | "PARTIALLY_RESOLVED" | "RESOLVED" | "ESCALATED" | "ABANDONED" | "TIMED_OUT";
export type ComplaintRuntimeStatus = "OPEN" | "PARTIALLY_ADDRESSED" | "REDIRECT_PENDING" | "RESOLVED" | "ESCALATED" | "ABANDONED";
export type ConversationStage = "opening" | "fact_finding" | "resolution" | "escalation" | "closure";
export type CustomerStrategy =
  | "seek_acknowledgment"
  | "seek_clarity"
  | "seek_action"
  | "seek_reassurance"
  | "protect_dignity"
  | "press_for_specifics"
  | "request_manager"
  | "follow_direction"
  | "close_out";

export type LikelyNextCustomerBehavior =
  | "stay_engaged"
  | "ask_follow_up"
  | "become_cautious"
  | "become_defensive"
  | "request_manager"
  | "disengage"
  | "follow_instructions"
  | "close_conversation";

export type ServiceFailureLevel = "none" | "mild" | "moderate" | "severe";
export type ActorResponseMode =
  | "seek_specific_answer"
  | "confused_reopen"
  | "skeptical_challenge"
  | "press_for_ownership"
  | "call_out_tone"
  | "call_out_repetition"
  | "question_competence"
  | "tentative_soften"
  | "request_manager"
  | "reopen_unresolved"
  | "follow_direction"
  | "close_out"
  | "disengage";
export type DeliveryRiskLevel = "low" | "medium" | "high";
export type DeliveryLoudnessConsistency = "stable" | "variable" | "erratic";
export type DeliveryIntensityLevel = "low" | "moderate" | "high";
export type ConversationRuntimeEventType =
  | "unresolved_complaint_persists"
  | "complaint_partially_addressed"
  | "complaint_fully_resolved"
  | "next_step_offered"
  | "next_step_rejected"
  | "escalation_offered"
  | "escalation_accepted"
  | "premature_closure_attempted"
  | "unresolved_gap_reopened"
  | "timeout_failure"
  | "abandonment_detected";

export type PrematureClosureTriggerSource =
  | "employee_transcript"
  | "employee_wrap_up_language"
  | "customer_reply_pattern"
  | "runtime_end_trigger"
  | "ui_auto_finish"
  | "transcript_finalized";

export interface PrematureClosureEvent {
  trigger_source: PrematureClosureTriggerSource;
  trigger_phrase_or_reason: string;
  complaint_still_open: boolean;
  unresolved_gaps_snapshot: string[];
  trust_level_at_attempt: number | null;
  emotional_state_at_attempt: string | null;
  blocked: boolean;
  customer_strategy_at_attempt?: string | null;
  likely_next_behavior_at_attempt?: string | null;
}

export interface ConversationRuntimeEvent {
  type: ConversationRuntimeEventType;
  source: "state_manager" | "client" | "live_runtime" | "persistence";
  atTurn: number;
  summary: string;
  outcomeState?: CustomerGoalStatus;
  unmetCriteria?: string[];
  blockedBy?: string[];
  prematureClosure?: PrematureClosureEvent;
}

export interface VoiceDeliveryAnalysis {
  audio?: {
    sampleRate?: number;
    durationSec?: number;
    rmsDb?: number;
    peakDb?: number;
    dynamicRangeDb?: number;
  };
  pacing?: {
    estimatedSpeechRateWpm?: number | null;
    voicedRatio?: number;
    avgPauseMs?: number;
    longPauseCount?: number;
    hesitationRisk?: DeliveryRiskLevel;
  };
  delivery?: {
    loudnessConsistency?: DeliveryLoudnessConsistency;
    intensity?: DeliveryIntensityLevel;
    interruptionRisk?: DeliveryRiskLevel;
    rushedRisk?: DeliveryRiskLevel;
    sharpnessRisk?: DeliveryRiskLevel;
    fragmentationRisk?: DeliveryRiskLevel;
    pacingStabilityRisk?: DeliveryRiskLevel;
    disfluencyRisk?: DeliveryRiskLevel;
  };
  coachingSignals?: string[];
  transcriptFusion?: {
    fillerDensity?: number;
    restartCount?: number;
    selfCorrectionCount?: number;
    incompleteSentenceRisk?: DeliveryRiskLevel;
  };
  diagnostics?: {
    burstRatePerMinute?: number;
    shortBurstRatio?: number;
    pauseVariability?: number;
    energyInstability?: number;
    restartLikeBurstCount?: number;
  };
}

export interface SimulationObjective {
  key: string;
  label: string;
  ask: string[];
  metBy: Array<keyof EmployeeUtteranceAnalysis | `flag:${string}`>;
}

export interface EmployeeUtteranceContext {
  latestCustomerMessage?: string;
  priorPromisesMade?: string[];
  previousEmployeeMessages?: string[];
  scenarioGoal?: string;
  deliveryAnalysis?: VoiceDeliveryAnalysis;
}

export interface EmployeeUtteranceAnalysis {
  clarity: number;
  politeness: number;
  warmth: number;
  confidence: number;
  respectfulness: number;
  empathy: number;
  professionalism: number;
  accuracy: number;
  accuracyConfidence: number;
  ownership: number;
  helpfulness: number;
  directness: number;
  explanationQuality: number;
  nextStepQuality: number;
  respectImpact: number;
  heardImpact: number;
  escalationJudgment: number;
  toneLabels: string[];
  strengths: string[];
  issues: string[];
  serviceSummary: string;
  answeredQuestion: boolean;
  avoidedQuestion: boolean;
  soundedDismissive: boolean;
  soundedRude: boolean;
  setExpectationsClearly: boolean;
  tookOwnership: boolean;
  escalatedAppropriately: boolean;
  madeCustomerFeelHeard: boolean;
  contradictionDetected: boolean;
  vaguenessDetected: boolean;
  fakeConfidence: boolean;
  blameShifting: boolean;
  policyMisuse: boolean;
  overTalking: boolean;
  deadEndLanguage: boolean;
  disrespect: boolean;
  passiveAggression: boolean;
  roboticPhrasing: boolean;
  explicitManagerMention: boolean;
  explicitDisrespect: boolean;
  explicitOwnership: boolean;
  explicitNextStep: boolean;
  explicitTimeline: boolean;
  explicitVerification: boolean;
  explicitExplanation: boolean;
  explicitSafetyControl: boolean;
  explicitDirection: boolean;
  explicitDiscovery: boolean;
  explicitRecommendation: boolean;
  explicitClosureAttempt: boolean;
  likelySolved: boolean;
  likelyStalled: boolean;
  summary: string;
}

export interface UtteranceReactionThresholds {
  feelHeardMin: number;
  trustGainMin: number;
  frustrationIncreaseMaxHelpfulness: number;
  escalationRiskMin: number;
  leaveRiskMinRespect: number;
  competenceGainMin: number;
}

export interface LlmAssistedUtteranceAssessment {
  clarity?: number;
  politeness?: number;
  warmth?: number;
  confidence?: number;
  respectfulness?: number;
  empathy?: number;
  professionalism?: number;
  accuracyConfidence?: number;
  answeredQuestion?: boolean;
  avoidedQuestion?: boolean;
  soundedDismissive?: boolean;
  soundedRude?: boolean;
  setExpectationsClearly?: boolean;
  tookOwnership?: boolean;
  escalatedAppropriately?: boolean;
  madeCustomerFeelHeard?: boolean;
  contradictionDetected?: boolean;
  vaguenessDetected?: boolean;
  fakeConfidence?: boolean;
  blameShifting?: boolean;
  policyMisuse?: boolean;
  overTalking?: boolean;
  deadEndLanguage?: boolean;
  disrespect?: boolean;
  passiveAggression?: boolean;
  roboticPhrasing?: boolean;
  notes?: string[];
}

export interface TurnProgressSummary {
  goalTitle: string;
  goalDescription: string;
  objectives: SimulationObjective[];
  metBefore: string[];
  metAfter: string[];
  newlyCompleted: string[];
  missingAfter: string[];
  nextMissing: SimulationObjective | null;
  hiddenFactRevealed: string;
}

export interface SimulationPromptContext {
  currentTurnNumber: number;
  employeeAnalysis: EmployeeUtteranceAnalysis;
  aggregateAnalysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  priorStateSummary: string;
  deliveryAnalysis?: VoiceDeliveryAnalysis;
  latestCustomerMessage?: string;
  priorPromisesMade?: string[];
}

export interface PersonaReactionProfile {
  patienceModifier: number;
  trustSensitivity: number;
  offenseSensitivity: number;
  confusionSensitivity: number;
  escalationSensitivity: number;
  disengagementSensitivity: number;
  quietWithdrawal: boolean;
  seeksManagerEarly: boolean;
  defaultNegativeStyle: "direct_pushback" | "quiet_withdrawal" | "measured_skepticism";
}

export interface CustomerHumanProfile {
  identityFlavor: string;
  issueReason: string;
  whatTheyWant: string;
  whatTheyThinkHappened: string;
  whatActuallyHappened: string;
  hiddenContext: string;
  pressureContext: string;
  emotionalBaseline: string;
  emotionalResidue: string;
  urgencyLevel: number;
  patienceLevel: number;
  directnessLevel: number;
  trustBaseline: number;
  priorBusinessExperience: string;
  sensitivityTriggers: string[];
  frictionPoints: string[];
  likelyAssumptions: string[];
  communicationStyle: string;
  stressContext: string;
  opennessToResolution: number;
  willingnessToEscalate: number;
  whatMakesThemFeelHeard: string[];
  whatMakesThemFeelBrushedOff: string[];
  whatMakesThemSkeptical: string[];
  whatMakesNextStepCredible: string[];
  whatCalmsThemDown: string[];
  whatMakesThemChallenge: string[];
  speakingPattern: "blunt" | "measured" | "warm" | "urgent" | "skeptical";
  interruptionStyle: "rare" | "situational" | "frequent";
  indirectnessStyle: "low" | "medium" | "high";
  sarcasmStyle: "none" | "light" | "sharp";
  repetitionStyle: "low" | "medium" | "high";
  warmthStyle: "cool" | "guarded" | "warm";
  usesFragments: boolean;
}

export interface ActorTurnInterpretation {
  answeredActualQuestion: boolean;
  trustDirection: "up" | "down" | "flat";
  clarityDirection: "up" | "down" | "flat";
  perceivedCompetence: "low" | "mixed" | "high";
  perceivedCare: "low" | "mixed" | "high";
  soundedScripted: boolean;
  feltHeard: boolean;
  feltBrushedOff: boolean;
  employeeRepeatedThemselves: boolean;
  needsOwnership: boolean;
  stillMissing: string[];
  unresolvedFocus: string;
  pushbackReason: string;
  canAcceptResolution: boolean;
  shouldReopen: boolean;
  shouldPush: boolean;
  shouldChallenge: boolean;
  shouldInterrupt: boolean;
  shouldRepeatConcern: boolean;
  shouldAnswerIndirectly: boolean;
  shouldUseSarcasm: boolean;
  responseMode: ActorResponseMode;
}

export interface EmotionalReactionThresholds {
  helpfulCalmMin: number;
  ownershipTrustMin: number;
  fakeConfidencePenaltyMaxAccuracy: number;
  disrespectEscalationMin: number;
  confusionSpikeMinContradictions: number;
  managerRequestTrustMax: number;
  disengageHelpfulnessMax: number;
  disengageRepeatWeakTurns: number;
}

export interface EmotionalReactionResult {
  updatedState: SimulationStateDraft;
  emotionalShiftExplanation: string;
  likelyNextBehavior: LikelyNextCustomerBehavior;
  responseStrategy: CustomerStrategy;
  serviceFailureLevel: ServiceFailureLevel;
  negativeReactionReason: string;
}

export interface SimulationStateDraft {
  turn_number: number;
  emotion_state: string;
  emotional_state: string;
  trust_level: number;
  issue_clarity: number;
  issue_complexity: number;
  clarification_depth: number;
  trust_damage_count: number;
  trust_recovery_count: number;
  unresolved_gap_count: number;
  misunderstood_turn_count: number;
  follow_up_question_count: number;
  resolution_momentum: number;
  no_progress_turns: number;
  stall_failure_risk: number;
  pacing_summary: string;
  initial_customer_complaint: string;
  complaint_category: string;
  complaint_status: ComplaintRuntimeStatus;
  complaint_still_open: boolean;
  current_customer_goal: string;
  customer_belief_about_problem: string;
  true_underlying_problem: string;
  root_issue_status: "UNRESOLVED" | "PARTIALLY_ADDRESSED" | "REDIRECT_PENDING" | "RESOLVED" | "ABANDONED";
  subissues_open: string[];
  discovered_facts: string[];
  false_customer_assumptions: string[];
  confirmed_business_facts: string[];
  resolution_requirements: string[];
  next_step_requirements: string[];
  escalation_requirements: string[];
  unresolved_subissues: string[];
  employee_promises_made: string[];
  employee_flags: {
    showed_empathy: boolean;
    answered_directly: boolean;
    used_correct_policy: boolean;
    took_ownership: boolean;
    avoided_question: boolean;
    critical_error: boolean;
  };
  escalation_required: boolean;
  scenario_risk_level: string;
  continue_simulation: boolean;
  customer_goal: string;
  goal_status: CustomerGoalStatus;
  issue_progress_state: CustomerGoalStatus;
  terminal_outcome_state: CustomerGoalStatus;
  terminal_validation_reason: string;
  completion_blockers: string[];
  accepted_next_step: boolean;
  next_step_owner: string;
  next_step_action: string;
  next_step_timeline: string;
  next_step_missing_fields: string[];
  valid_redirect: boolean;
  escalation_validity: "invalid" | "potential" | "valid";
  premature_closure_detected: boolean;
  unmet_completion_criteria: string[];
  unresolved_customer_questions: string[];
  unresolved_questions: string[];
  outcome_summary: string;
  patience_level: number;
  urgency_level: number;
  communication_style: string;
  cooperation_level: number;
  offense_level: number;
  manager_request_level: number;
  resolution_confidence: number;
  confidence_in_employee: number;
  willingness_to_accept_redirect: number;
  willingness_to_escalate: number;
  customer_strategy: CustomerStrategy;
  likely_next_behavior: LikelyNextCustomerBehavior;
  emotional_shift_explanation: string;
  conversation_stage: ConversationStage;
  analysis_summary: string;
  latest_employee_analysis: EmployeeUtteranceAnalysis;
  runtime_events: ConversationRuntimeEvent[];
}

export type StateUpdateWithRuntimeFields = SimulationStateDraft;
