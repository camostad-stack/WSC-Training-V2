export interface CustomerPersona {
  name: string;
  age_band?: string;
  membership_context?: string;
  membership_status?: string;
  communication_style: string;
  initial_emotion: string;
  patience_level?: string;
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
  hidden_facts: string[];
  approved_resolution_paths?: string[];
  required_behaviors?: string[];
  critical_errors?: string[];
  branch_logic?: BranchLogic;
  emotion_progression?: EmotionProgression;
  completion_rules?: CompletionRules;
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
  trust_level: number;
  issue_clarity: number;
  employee_flags?: Record<string, boolean>;
  escalation_required?: boolean;
  scenario_risk_level?: string;
  continue_simulation?: boolean;
}

export interface LiveTurnEvent {
  type: string;
  source: "system" | "employee" | "customer";
  atMs: number;
  payload?: Record<string, unknown>;
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
