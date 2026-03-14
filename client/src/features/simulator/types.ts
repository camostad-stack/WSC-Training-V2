export interface CustomerPersona {
  name: string;
  age_band?: string;
  membership_context?: string;
  membership_status?: string;
  communication_style: string;
  initial_emotion: string;
  patience_level?: string;
  voice_hint?: {
    presentation?: "feminine" | "masculine" | "neutral";
    locale?: string;
    age_flavor?: "young_adult" | "adult" | "older_adult";
    notes?: string;
  };
}

export interface BranchLogic {
  if_empathy_is_strong: string;
  if_answer_is_vague: string;
  if_policy_is_wrong: string;
  if_employee_takes_ownership: string;
  if_employee_fails_to_help: string;
  if_employee_escalates_correctly: string;
}

export interface EmotionProgression {
  starting_state: string;
  better_if: string[];
  worse_if: string[];
}

export interface CompletionRules {
  resolved_if: string[];
  end_early_if: string[];
  manager_required_if: string[];
}

export interface ScenarioCard {
  scenario_id: string;
  department: string;
  employee_role: string;
  escalation_role?: string;
  difficulty: number;
  mode?: "in-person" | "phone" | "live-voice";
  scenario_family?: string;
  customer_persona: CustomerPersona;
  issue_type?: string;
  situation_summary: string;
  opening_line: string;
  repeat_caller_key?: string;
  preserve_caller_voice?: boolean;
  hidden_facts: string[];
  approved_resolution_paths?: string[];
  required_behaviors?: string[];
  critical_errors?: string[];
  branch_logic?: BranchLogic;
  emotion_progression?: EmotionProgression;
  completion_rules?: CompletionRules;
  completion_criteria?: string[];
  failure_criteria?: string[];
  must_handle_well?: string[];
  success_criteria?: string[];
  failure_triggers?: string[];
  recommended_turns: number;
}

export interface ConversationTurn {
  role: "customer" | "employee";
  message: string;
  emotion?: string;
  timestamp: number;
}

export interface SimulationStateSnapshot {
  turn_number: number;
  emotion_state: string;
  emotional_state?: string;
  trust_level: number;
  issue_clarity: number;
  issue_complexity?: number;
  clarification_depth?: number;
  trust_damage_count?: number;
  trust_recovery_count?: number;
  unresolved_gap_count?: number;
  misunderstood_turn_count?: number;
  follow_up_question_count?: number;
  resolution_momentum?: number;
  no_progress_turns?: number;
  stall_failure_risk?: number;
  pacing_summary?: string;
  initial_customer_complaint?: string;
  complaint_category?: string;
  complaint_status?: "OPEN" | "PARTIALLY_ADDRESSED" | "REDIRECT_PENDING" | "RESOLVED" | "ESCALATED" | "ABANDONED";
  complaint_still_open?: boolean;
  current_customer_goal?: string;
  customer_belief_about_problem?: string;
  true_underlying_problem?: string;
  root_issue_status?: "UNRESOLVED" | "PARTIALLY_ADDRESSED" | "REDIRECT_PENDING" | "RESOLVED" | "ABANDONED";
  subissues_open?: string[];
  discovered_facts?: string[];
  false_customer_assumptions?: string[];
  confirmed_business_facts?: string[];
  resolution_requirements?: string[];
  next_step_requirements?: string[];
  escalation_requirements?: string[];
  unresolved_subissues?: string[];
  employee_promises_made?: string[];
  employee_flags?: Record<string, boolean>;
  escalation_required?: boolean;
  scenario_risk_level?: string;
  continue_simulation?: boolean;
  customer_goal?: string;
  goal_status?: "ACTIVE" | "PARTIALLY_RESOLVED" | "RESOLVED" | "ESCALATED" | "ABANDONED" | "TIMED_OUT";
  issue_progress_state?: "ACTIVE" | "PARTIALLY_RESOLVED" | "RESOLVED" | "ESCALATED" | "ABANDONED" | "TIMED_OUT";
  terminal_outcome_state?: "ACTIVE" | "PARTIALLY_RESOLVED" | "RESOLVED" | "ESCALATED" | "ABANDONED" | "TIMED_OUT";
  terminal_validation_reason?: string;
  completion_blockers?: string[];
  accepted_next_step?: boolean;
  next_step_owner?: string;
  next_step_action?: string;
  next_step_timeline?: string;
  next_step_missing_fields?: string[];
  valid_redirect?: boolean;
  escalation_validity?: "invalid" | "potential" | "valid";
  premature_closure_detected?: boolean;
  unmet_completion_criteria?: string[];
  unresolved_customer_questions?: string[];
  unresolved_questions?: string[];
  outcome_summary?: string;
  patience_level?: number;
  urgency_level?: number;
  communication_style?: string;
  cooperation_level?: number;
  offense_level?: number;
  manager_request_level?: number;
  resolution_confidence?: number;
  confidence_in_employee?: number;
  willingness_to_accept_redirect?: number;
  willingness_to_escalate?: number;
  customer_strategy?: string;
  likely_next_behavior?: string;
  conversation_stage?: "opening" | "fact_finding" | "resolution" | "escalation" | "closure";
  analysis_summary?: string;
  latest_employee_analysis?: Record<string, unknown>;
  runtime_events?: Array<{
    type:
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
    source: "state_manager" | "client" | "live_runtime" | "persistence";
    atTurn: number;
    summary: string;
    outcomeState?: "ACTIVE" | "PARTIALLY_RESOLVED" | "RESOLVED" | "ESCALATED" | "ABANDONED" | "TIMED_OUT";
    unmetCriteria?: string[];
    blockedBy?: string[];
    prematureClosure?: {
      trigger_source:
        | "employee_transcript"
        | "employee_wrap_up_language"
        | "customer_reply_pattern"
        | "runtime_end_trigger"
        | "ui_auto_finish"
        | "transcript_finalized";
      trigger_phrase_or_reason: string;
      complaint_still_open: boolean;
      unresolved_gaps_snapshot: string[];
      trust_level_at_attempt: number | null;
      emotional_state_at_attempt: string | null;
      blocked: boolean;
      customer_strategy_at_attempt?: string | null;
      likely_next_behavior_at_attempt?: string | null;
    };
  }>;
}

export interface LiveTurnEvent {
  type: string;
  source: "system" | "employee" | "customer";
  atMs: number;
  payload?: Record<string, unknown>;
}

export type DeliveryRiskLevel = "low" | "medium" | "high";
export type DeliveryLoudnessConsistency = "stable" | "variable" | "erratic";
export type DeliveryIntensityLevel = "low" | "moderate" | "high";
export type VoiceRenderProvider =
  | "openai-realtime-native"
  | "openai-native-speech"
  | "cartesia"
  | "elevenlabs"
  | "browser-native-speech";

export interface CustomerVoiceCast {
  provider: VoiceRenderProvider;
  voiceId: string;
  sessionSeed: string;
  cadenceFingerprint: string;
  personaArchetype:
    | "rushed_impatient"
    | "calm_skeptical"
    | "polite_frustrated"
    | "blunt_low_patience"
    | "warm_confused"
    | "suspicious_direct"
    | "steady_practical"
    | "anxious_cautious";
  openerCadencePattern:
    | "straight-to-the-point"
    | "guarded-then-direct"
    | "brisk-with-pressure"
    | "warm-but-uncertain"
    | "skeptical-check-in"
    | "frayed-and-clipped";
  apologyRhythmPattern:
    | "rare-and-brusque"
    | "quick-self-correction"
    | "softened-reluctantly"
    | "matter-of-fact"
    | "defensive-under-breath";
  closurePhrasingStyle:
    | "guarded-acceptance"
    | "skeptical-last-check"
    | "brief-drop-off"
    | "practical-sign-off"
    | "relieved-but-watching";
  emotionalArcPattern:
    | "spikes-before-softening"
    | "flat-then-wary-trust"
    | "skeptical-until-specifics"
    | "frayed-then-practical"
    | "warmth-lost-then-recovered";
  pace: "slow" | "steady" | "brisk";
  warmth: "cool" | "neutral" | "warm";
  sharpness: "soft" | "balanced" | "edgy";
  energy: "low" | "medium" | "high";
  interruptionTendency: "rare" | "situational" | "frequent";
  hesitationTendency: "rare" | "light" | "noticeable";
  verbosityTendency: "brief" | "balanced" | "expansive";
  ageFlavor: "young_adult" | "adult" | "older_adult";
  emotionalResponsiveness: "restrained" | "flexible" | "volatile";
  speechRate: number;
  pitch: number;
  stylePrompt: string;
  emotionHint: string;
  providerModel?: string;
  fallbackProviders: VoiceRenderProvider[];
  repeatCallerKey?: string;
  preserveCallerVoice?: boolean;
  providerCapabilities: {
    provider: VoiceRenderProvider;
    supportsStreaming: boolean;
    supportsEmotionControl: boolean;
    supportsSpeedControl: boolean;
    supportsStyleControl: boolean;
    supportsCustomVoices: boolean;
    supportsRealtimeNativeOutput: boolean;
    supportsWordTimestamps: boolean;
    defaultModel: string;
    supportedModels: string[];
    outputFormats: Array<{
      container: "mp3" | "wav" | "pcm" | "raw";
      encoding?: "mp3" | "pcm_s16le" | "pcm_f32le" | "mulaw";
      sampleRateHz?: number;
      mimeType?: string;
    }>;
  };
  castingDiagnostics: {
    repeatCaller: boolean;
    recentVoiceUsageFrequency: number;
    recentProviderUsageFrequency: number;
    recentPersonaUsageFrequency: number;
    recentCadenceUsageFrequency: number;
    assignmentReasons: string[];
    fallbackEvents: Array<{
      fromProvider: VoiceRenderProvider;
      toProvider: VoiceRenderProvider;
      reason: string;
      sessionSeed?: string;
      attemptedVoiceId?: string;
    }>;
  };
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

export interface TimingMarker {
  name: string;
  atMs: number;
  detail?: string;
}

export type SessionSaveStatus = "idle" | "saving" | "saved" | "error";

export interface EvaluationResult {
  overall_score: number;
  pass_fail: string;
  readiness_signal: string;
  category_scores: Record<string, number>;
  score_dimensions?: {
    interaction_quality: number;
    operational_effectiveness: number;
    outcome_quality: number;
  };
  best_moments: string[];
  missed_moments: string[];
  critical_mistakes: string[];
  coachable_mistakes: string[];
  most_important_correction: string;
  ideal_response_example: string;
  summary: string;
  competency_estimate?: string;
  strengths?: string[];
  misses?: string[];
  policy_or_safety_errors?: string[];
  best_evidence_quotes?: string[];
  final_summary?: string;
  recommended_next_scenario_type?: string;
}

export interface CoachingNote {
  employee_coaching_summary: string;
  what_you_did_well: string[];
  what_hurt_you: string[];
  do_this_next_time: string[];
  replacement_phrases: string[];
  practice_focus: string;
  next_recommended_scenario: string;
  manager_summary?: string;
  top_3_strengths?: string[];
  top_3_corrections?: string[];
  next_drill?: string;
  manager_follow_up_needed?: boolean;
}

export interface ManagerDebrief {
  manager_summary: string;
  performance_signal: string;
  top_strengths: string[];
  top_corrections: string[];
  whether_live_shadowing_is_needed: boolean;
  whether_manager_follow_up_is_needed: boolean;
  recommended_follow_up_action: string;
  recommended_next_drill: string;
}

export interface SimulatorConfig {
  department: string;
  employeeRole: string;
  difficulty: number;
  mode: "in-person" | "phone" | "live-voice";
  scenarioFamily?: string;
  scenarioTemplateId?: number;
  assignmentId?: number;
  assignmentTitle?: string;
  difficultyMin?: number;
  difficultyMax?: number;
}
