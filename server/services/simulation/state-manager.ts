import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";
import { getScenarioGoal } from "@shared/wsc-content";
import {
  appendConversationRuntimeEvent,
  buildPrematureClosureRuntimeEvent,
  buildRuntimeEvent,
  evaluateConversationTerminalState,
  getConversationOutcomeState,
  type ConversationOutcomeState,
} from "@shared/conversation-outcome";
import { applyEmotionalReaction } from "./emotion";
import { mapPatienceLabelToValue } from "./personas";
import { buildInitialComplaintState, evaluateComplaintOutcome } from "./complaint-state";
import { buildInitialPacingState, derivePacingUpdate } from "./pacing";
import type {
  ConversationStage,
  EmployeeUtteranceAnalysis,
  SimulationStateDraft,
  TurnProgressSummary,
} from "./types";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function isUrgentScenario(scenario: ScenarioDirectorResult) {
  return scenario.department === "mod_emergency"
    || ["slippery_entry_complaint", "unsafe_equipment_report", "weather_range_incident", "emergency_response"].includes(scenario.scenario_family);
}

function inferUrgencyLevel(scenario: ScenarioDirectorResult) {
  if (scenario.scenario_family === "emergency_response") return 10;
  if (scenario.department === "mod_emergency") return 8;
  if (["billing_confusion", "reservation_issue", "upset_parent", "range_complaint"].includes(scenario.scenario_family)) return 6;
  return 4;
}

function deriveRiskLevel(state: SimulationStateDraft) {
  if (state.urgency_level >= 8 || state.offense_level >= 8 || state.manager_request_level >= 8) return "high";
  if (state.trust_level >= 6 && state.issue_clarity >= 6 && state.offense_level <= 3 && state.urgency_level <= 6) return "low";
  return "moderate";
}

function extractEmployeePromises(message: string) {
  const normalized = message.trim();
  if (!normalized) return [];

  const promisePatterns = [
    /\b(i will|i'll|i am going to|i'm going to)\b[^.?!]*/gi,
    /\b(you will|you'll)\b[^.?!]*/gi,
    /\b(by [^.?!]+|within [^.?!]+|before [^.?!]+|in \d+ (minute|minutes|hour|hours|day|days))\b/gi,
  ];

  const matches = promisePatterns.flatMap((pattern) => normalized.match(pattern) || []);
  return dedupeStrings(matches.map((value) => value.replace(/\s+/g, " ").trim())).slice(0, 6);
}

function updateDiscoveredFacts(params: {
  priorFacts: string[];
  progress: TurnProgressSummary;
  analysis: EmployeeUtteranceAnalysis;
  scenario: ScenarioDirectorResult;
}) {
  const discovered = [...params.priorFacts];
  if (params.progress.hiddenFactRevealed) discovered.push(params.progress.hiddenFactRevealed);
  if (params.analysis.explicitVerification) discovered.push("employee verified the underlying account or status details");
  if (params.analysis.explicitExplanation) discovered.push("employee explained what happened in plain terms");
  if (params.scenario.department === "mod_emergency" && params.analysis.explicitSafetyControl) {
    discovered.push("employee established immediate operational control");
  }
  if (params.scenario.department === "mod_emergency" && params.analysis.explicitDirection) {
    discovered.push("employee gave an immediate operational direction");
  }
  return dedupeStrings(discovered);
}

function determineConversationStage(params: {
  priorState: SimulationStateDraft;
  goalStatus: ConversationOutcomeState;
  progress: TurnProgressSummary;
  currentAnalysis: EmployeeUtteranceAnalysis;
}): ConversationStage {
  if (params.goalStatus === "RESOLVED" || params.goalStatus === "ABANDONED" || params.goalStatus === "TIMED_OUT") return "closure";
  if (params.goalStatus === "ESCALATED") return "escalation";
  if (
    params.priorState.discovered_facts.length === 0
    && params.priorState.employee_promises_made.length === 0
    && params.progress.metAfter.length <= 1
  ) {
    return "opening";
  }
  if (params.currentAnalysis.explicitNextStep || params.progress.missingAfter.length <= 1) return "resolution";
  return "fact_finding";
}

function applyRuntimeEvent(
  state: SimulationStateDraft,
  type: Parameters<typeof buildRuntimeEvent>[0],
  summary: string,
  extra?: Partial<ReturnType<typeof buildRuntimeEvent>>,
) {
  state.runtime_events = appendConversationRuntimeEvent(
    state,
    buildRuntimeEvent(type, state, "state_manager", summary, extra),
  );
}

export function buildInitialHiddenConversationState(scenario: ScenarioDirectorResult): SimulationStateDraft {
  const initialEmotion = scenario.customer_persona.initial_emotion || scenario.emotion_progression.starting_state || "concerned";
  const initialTrust = scenario.department === "golf" ? 4 : 3;
  const initialClarity = scenario.department === "mod_emergency" ? 5 : 3;
  const scenarioGoal = getScenarioGoal(scenario);
  const complaintState = buildInitialComplaintState(scenario);
  const pacingState = buildInitialPacingState(scenario, {
    subissues_open: complaintState.subissues_open,
    unresolved_customer_questions: complaintState.unresolved_customer_questions,
    next_step_missing_fields: complaintState.next_step_missing_fields,
    accepted_next_step: false,
    valid_redirect: false,
  });

  return {
    turn_number: 1,
    emotion_state: initialEmotion,
    emotional_state: initialEmotion,
    trust_level: initialTrust,
    issue_clarity: initialClarity,
    issue_complexity: pacingState.issue_complexity,
    clarification_depth: pacingState.clarification_depth,
    trust_damage_count: pacingState.trust_damage_count,
    trust_recovery_count: pacingState.trust_recovery_count,
    unresolved_gap_count: pacingState.unresolved_gap_count,
    misunderstood_turn_count: pacingState.misunderstood_turn_count,
    follow_up_question_count: pacingState.follow_up_question_count,
    resolution_momentum: pacingState.resolution_momentum,
    no_progress_turns: pacingState.no_progress_turns,
    stall_failure_risk: pacingState.stall_failure_risk,
    pacing_summary: pacingState.pacing_summary,
    initial_customer_complaint: scenario.opening_line,
    complaint_category: complaintState.complaint_category,
    complaint_status: complaintState.complaint_status,
    complaint_still_open: complaintState.complaint_still_open,
    current_customer_goal: scenarioGoal.title,
    customer_belief_about_problem: scenario.opening_line,
    true_underlying_problem: scenario.hidden_facts[0] || scenario.situation_summary,
    root_issue_status: "UNRESOLVED",
    subissues_open: complaintState.subissues_open,
    discovered_facts: [],
    false_customer_assumptions: complaintState.false_customer_assumptions,
    confirmed_business_facts: complaintState.confirmed_business_facts,
    resolution_requirements: complaintState.resolution_requirements,
    next_step_requirements: complaintState.next_step_requirements,
    escalation_requirements: complaintState.escalation_requirements,
    unresolved_subissues: complaintState.subissues_open,
    employee_promises_made: [],
    employee_flags: {
      showed_empathy: false,
      answered_directly: false,
      used_correct_policy: false,
      took_ownership: false,
      avoided_question: false,
      critical_error: false,
    },
    escalation_required: false,
    scenario_risk_level: isUrgentScenario(scenario) ? "high" : "moderate",
    continue_simulation: true,
    customer_goal: scenarioGoal.title,
    goal_status: "ACTIVE",
    issue_progress_state: "ACTIVE",
    terminal_outcome_state: "ACTIVE",
    terminal_validation_reason: "Conversation is still active and cannot end yet.",
    completion_blockers: ["conversation_still_active"],
    accepted_next_step: false,
    next_step_owner: "",
    next_step_action: "",
    next_step_timeline: "",
    next_step_missing_fields: complaintState.next_step_missing_fields,
    valid_redirect: false,
    escalation_validity: "invalid",
    premature_closure_detected: false,
    unmet_completion_criteria: complaintState.subissues_open,
    unresolved_customer_questions: complaintState.unresolved_customer_questions,
    unresolved_questions: [],
    outcome_summary: "Conversation is active and still needs a real outcome.",
    patience_level: mapPatienceLabelToValue(scenario.customer_persona.patience_level),
    urgency_level: inferUrgencyLevel(scenario),
    communication_style: scenario.customer_persona.communication_style || "direct",
    cooperation_level: scenario.department === "golf" ? 6 : 5,
    offense_level: 2,
    manager_request_level: 1,
    resolution_confidence: 1,
    confidence_in_employee: initialTrust,
    willingness_to_accept_redirect: 3,
    willingness_to_escalate: 2,
    customer_strategy: "seek_acknowledgment",
    likely_next_behavior: "stay_engaged",
    emotional_shift_explanation: "Conversation is just starting.",
    conversation_stage: "opening",
    analysis_summary: "Conversation is just starting.",
    runtime_events: [],
    latest_employee_analysis: {
      clarity: 3,
      politeness: 5,
      warmth: 4,
      confidence: 3,
      respectfulness: 5,
      empathy: 3,
      professionalism: 4,
      accuracy: 5,
      accuracyConfidence: 4,
      ownership: 3,
      helpfulness: 3,
      directness: 3,
      explanationQuality: 3,
      nextStepQuality: 3,
      respectImpact: 0,
      heardImpact: 0,
      escalationJudgment: 5,
      toneLabels: ["neutral"],
      strengths: [],
      issues: [],
      serviceSummary: "no employee response yet",
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
      likelyStalled: true,
      summary: "no employee response yet",
    },
  };
}

export function reduceHiddenConversationState(params: {
  scenario: ScenarioDirectorResult;
  priorState: SimulationStateDraft;
  currentTurnNumber: number;
  analysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  transcript: TranscriptTurn[];
  latestCustomerMessage?: string;
  employeeMessage: string;
}): SimulationStateDraft {
  const urgent = isUrgentScenario(params.scenario);
  const complaintSeed = buildInitialComplaintState(params.scenario);
  const trustDelta = Math.round((params.analysis.respectfulness + params.analysis.helpfulness + params.analysis.accuracy - 15) / 3)
    + (params.analysis.ownership >= 6 ? 1 : 0)
    + (params.progress.newlyCompleted.length > 0 ? 1 : 0)
    - (params.analysis.helpfulness <= 4 ? 1 : 0)
    - (params.analysis.explicitDisrespect ? 2 : 0);
  const patienceDelta = params.analysis.helpfulness >= 6 ? 1 : -1;
  const offenseDelta = (params.analysis.explicitDisrespect ? 4 : 0)
    + (params.analysis.accuracy <= 2 ? 2 : 0)
    - (params.analysis.empathy >= 6 ? 1 : 0);
  const managerDelta = (params.analysis.explicitManagerMention ? -1 : 0)
    + (params.analysis.explicitDisrespect ? 4 : 0)
    + (params.analysis.accuracy <= 2 ? 2 : 0)
    + (params.progress.missingAfter.length > 2 && params.analysis.helpfulness <= 4 ? 1 : 0)
    - (params.progress.newlyCompleted.length > 0 ? 1 : 0);

  const draft: SimulationStateDraft = {
    ...params.priorState,
    turn_number: params.currentTurnNumber,
    trust_level: clamp(params.priorState.trust_level + trustDelta),
    issue_clarity: clamp(params.priorState.issue_clarity + Math.round((params.analysis.clarity + params.analysis.explanationQuality - 8) / 2) + (params.progress.newlyCompleted.length > 0 ? 1 : 0)),
    issue_complexity: params.priorState.issue_complexity || buildInitialPacingState(params.scenario, {
      subissues_open: params.priorState.subissues_open || [],
      unresolved_customer_questions: params.priorState.unresolved_customer_questions || [],
      next_step_missing_fields: params.priorState.next_step_missing_fields || [],
      accepted_next_step: params.priorState.accepted_next_step || false,
      valid_redirect: params.priorState.valid_redirect || false,
    }).issue_complexity,
    clarification_depth: params.priorState.clarification_depth || 0,
    trust_damage_count: params.priorState.trust_damage_count || 0,
    trust_recovery_count: params.priorState.trust_recovery_count || 0,
    unresolved_gap_count: params.priorState.unresolved_gap_count || 0,
    misunderstood_turn_count: params.priorState.misunderstood_turn_count || 0,
    follow_up_question_count: params.priorState.follow_up_question_count || 0,
    resolution_momentum: params.priorState.resolution_momentum || 0,
    no_progress_turns: params.priorState.no_progress_turns || 0,
    stall_failure_risk: params.priorState.stall_failure_risk || 0,
    pacing_summary: params.priorState.pacing_summary || "",
    employee_flags: {
      showed_empathy: params.analysis.empathy >= 6,
      answered_directly: params.analysis.clarity >= 6 || params.analysis.directness >= 6,
      used_correct_policy: params.analysis.accuracy >= 6,
      took_ownership: params.analysis.ownership >= 6,
      avoided_question: params.analysis.helpfulness <= 4 || params.analysis.issues.includes("did not give a usable next step"),
      critical_error: params.analysis.explicitDisrespect || params.analysis.accuracy <= 2,
    },
    escalation_required: false,
    scenario_risk_level: params.priorState.scenario_risk_level,
    continue_simulation: true,
    initial_customer_complaint: params.priorState.initial_customer_complaint || params.latestCustomerMessage || params.scenario.opening_line,
    complaint_category: params.priorState.complaint_category || complaintSeed.complaint_category,
    complaint_status: params.priorState.complaint_status || "OPEN",
    complaint_still_open: true,
    current_customer_goal: params.priorState.current_customer_goal || params.priorState.customer_goal || getScenarioGoal(params.scenario).title,
    customer_goal: params.priorState.customer_goal || getScenarioGoal(params.scenario).title,
    goal_status: "ACTIVE",
    issue_progress_state: "ACTIVE",
    terminal_outcome_state: "ACTIVE",
    root_issue_status: params.priorState.root_issue_status || "UNRESOLVED",
    subissues_open: [],
    discovered_facts: updateDiscoveredFacts({
      priorFacts: params.priorState.discovered_facts || [],
      progress: params.progress,
      analysis: params.analysis,
      scenario: params.scenario,
    }),
    false_customer_assumptions: [],
    confirmed_business_facts: [],
    resolution_requirements: params.priorState.resolution_requirements || complaintSeed.resolution_requirements,
    next_step_requirements: params.priorState.next_step_requirements || complaintSeed.next_step_requirements,
    escalation_requirements: params.priorState.escalation_requirements || complaintSeed.escalation_requirements,
    unresolved_subissues: [],
    employee_promises_made: dedupeStrings([
      ...(params.priorState.employee_promises_made || []),
      ...extractEmployeePromises(params.employeeMessage),
    ]),
    accepted_next_step: false,
    next_step_owner: "",
    next_step_action: "",
    next_step_timeline: "",
    next_step_missing_fields: [],
    valid_redirect: false,
    escalation_validity: "invalid",
    premature_closure_detected: false,
    unmet_completion_criteria: [],
    unresolved_customer_questions: [],
    unresolved_questions: [],
    outcome_summary: "",
    patience_level: clamp(params.priorState.patience_level + patienceDelta),
    urgency_level: clamp(Math.max(params.priorState.urgency_level, inferUrgencyLevel(params.scenario)) - (params.progress.newlyCompleted.length > 0 && !urgent ? 1 : 0), 1, 10),
    communication_style: params.priorState.communication_style || params.scenario.customer_persona.communication_style,
    cooperation_level: clamp(params.priorState.cooperation_level + (params.analysis.helpfulness >= 6 ? 1 : -1) - (params.analysis.explicitDisrespect ? 2 : 0)),
    offense_level: clamp(params.priorState.offense_level + offenseDelta),
    manager_request_level: clamp(params.priorState.manager_request_level + managerDelta),
    resolution_confidence: clamp(Math.round((params.progress.metAfter.length / params.progress.objectives.length) * 10) + (params.analysis.nextStepQuality >= 6 ? 1 : 0)),
    customer_strategy: "seek_clarity",
    likely_next_behavior: "ask_follow_up",
    emotional_shift_explanation: params.analysis.summary,
    conversation_stage: "fact_finding",
    analysis_summary: params.analysis.summary,
    latest_employee_analysis: params.analysis,
    customer_belief_about_problem: params.priorState.customer_belief_about_problem || params.latestCustomerMessage || params.scenario.opening_line,
    true_underlying_problem: params.priorState.true_underlying_problem || params.scenario.hidden_facts[0] || params.scenario.situation_summary,
    emotional_state: params.priorState.emotion_state,
    confidence_in_employee: clamp(params.priorState.confidence_in_employee || params.priorState.trust_level),
    willingness_to_accept_redirect: params.priorState.willingness_to_accept_redirect || 3,
    willingness_to_escalate: params.priorState.willingness_to_escalate || 2,
  };

  draft.conversation_stage = determineConversationStage({
    priorState: params.priorState,
    goalStatus: getConversationOutcomeState(draft),
    progress: params.progress,
    currentAnalysis: params.analysis,
  });

  const reaction = applyEmotionalReaction({
    scenario: params.scenario,
    priorState: params.priorState,
    draftState: draft,
    analysis: params.analysis,
    recentConversationHistory: params.transcript,
  });
  const complaintOutcome = evaluateComplaintOutcome({
    scenario: params.scenario,
    currentState: reaction.updatedState,
    progress: params.progress,
    analysis: params.analysis,
    latestCustomerMessage: params.latestCustomerMessage,
    employeeMessage: params.employeeMessage,
    discoveredFacts: reaction.updatedState.discovered_facts,
  });

  reaction.updatedState.complaint_category = complaintOutcome.complaint_category;
  reaction.updatedState.complaint_status = complaintOutcome.complaint_status;
  reaction.updatedState.complaint_still_open = complaintOutcome.complaint_still_open;
  reaction.updatedState.subissues_open = complaintOutcome.subissues_open;
  reaction.updatedState.false_customer_assumptions = complaintOutcome.false_customer_assumptions;
  reaction.updatedState.confirmed_business_facts = complaintOutcome.confirmed_business_facts;
  reaction.updatedState.resolution_requirements = complaintOutcome.resolution_requirements;
  reaction.updatedState.next_step_requirements = complaintOutcome.next_step_requirements;
  reaction.updatedState.escalation_requirements = complaintOutcome.escalation_requirements;
  reaction.updatedState.goal_status = complaintOutcome.outcomeState;
  reaction.updatedState.issue_progress_state = complaintOutcome.outcomeState;
  reaction.updatedState.terminal_outcome_state = complaintOutcome.outcomeState;
  reaction.updatedState.accepted_next_step = complaintOutcome.acceptedNextStep;
  reaction.updatedState.valid_redirect = complaintOutcome.validRedirect;
  reaction.updatedState.next_step_owner = complaintOutcome.nextStepOwner;
  reaction.updatedState.next_step_action = complaintOutcome.nextStepAction;
  reaction.updatedState.next_step_timeline = complaintOutcome.nextStepTimeline;
  reaction.updatedState.next_step_missing_fields = complaintOutcome.next_step_missing_fields;
  reaction.updatedState.escalation_validity = complaintOutcome.escalationValidity;
  reaction.updatedState.premature_closure_detected = complaintOutcome.prematureClosureDetected;
  reaction.updatedState.unmet_completion_criteria = complaintOutcome.unmetCompletionCriteria;
  reaction.updatedState.unresolved_customer_questions = complaintOutcome.unresolved_customer_questions;
  reaction.updatedState.unresolved_questions = complaintOutcome.unresolvedQuestions;
  reaction.updatedState.unresolved_subissues = complaintOutcome.subissues_open;
  reaction.updatedState.root_issue_status = complaintOutcome.rootIssueStatus;
  reaction.updatedState.outcome_summary = complaintOutcome.outcomeSummary;
  const pacingUpdate = derivePacingUpdate({
    scenario: params.scenario,
    priorState: params.priorState,
    currentState: reaction.updatedState,
    analysis: params.analysis,
    latestCustomerMessage: params.latestCustomerMessage,
  });
  reaction.updatedState.issue_complexity = pacingUpdate.issue_complexity;
  reaction.updatedState.clarification_depth = pacingUpdate.clarification_depth;
  reaction.updatedState.trust_damage_count = pacingUpdate.trust_damage_count;
  reaction.updatedState.trust_recovery_count = pacingUpdate.trust_recovery_count;
  reaction.updatedState.unresolved_gap_count = pacingUpdate.unresolved_gap_count;
  reaction.updatedState.misunderstood_turn_count = pacingUpdate.misunderstood_turn_count;
  reaction.updatedState.follow_up_question_count = pacingUpdate.follow_up_question_count;
  reaction.updatedState.resolution_momentum = pacingUpdate.resolution_momentum;
  reaction.updatedState.no_progress_turns = pacingUpdate.no_progress_turns;
  reaction.updatedState.stall_failure_risk = pacingUpdate.stall_failure_risk;
  reaction.updatedState.pacing_summary = pacingUpdate.pacing_summary;

  if (pacingUpdate.shouldTimeoutFailure) {
    reaction.updatedState.goal_status = "TIMED_OUT";
    reaction.updatedState.issue_progress_state = "TIMED_OUT";
    reaction.updatedState.terminal_outcome_state = "TIMED_OUT";
    reaction.updatedState.complaint_status = "OPEN";
    reaction.updatedState.complaint_still_open = true;
    reaction.updatedState.root_issue_status = "UNRESOLVED";
    reaction.updatedState.outcome_summary = pacingUpdate.timeoutFailureSummary;
    reaction.updatedState.likely_next_behavior = "disengage";
  }

  const terminalValidation = evaluateConversationTerminalState(reaction.updatedState);
  reaction.updatedState.terminal_validation_reason = terminalValidation.terminalReason;
  reaction.updatedState.completion_blockers = terminalValidation.blockedBy;
  reaction.updatedState.confidence_in_employee = clamp(Math.round((reaction.updatedState.trust_level + reaction.updatedState.issue_clarity) / 2));
  reaction.updatedState.willingness_to_accept_redirect = clamp(Math.round((reaction.updatedState.trust_level + reaction.updatedState.issue_clarity + reaction.updatedState.cooperation_level - reaction.updatedState.offense_level) / 3));
  reaction.updatedState.willingness_to_escalate = clamp(Math.round((reaction.updatedState.manager_request_level + reaction.updatedState.offense_level + reaction.updatedState.urgency_level) / 3));
  const complaintCriteriaCount = Math.max(1, reaction.updatedState.resolution_requirements.length + reaction.updatedState.next_step_requirements.length);
  const complaintCriteriaRemaining = reaction.updatedState.subissues_open.length + reaction.updatedState.next_step_missing_fields.length;
  reaction.updatedState.resolution_confidence = clamp(Math.round(((complaintCriteriaCount - Math.min(complaintCriteriaRemaining, complaintCriteriaCount)) / complaintCriteriaCount) * 10));
  reaction.updatedState.continue_simulation = !terminalValidation.isTerminal;
  reaction.updatedState.escalation_required = complaintOutcome.outcomeState === "ESCALATED" || reaction.updatedState.manager_request_level >= 7 || reaction.updatedState.willingness_to_escalate >= 7;
  reaction.updatedState.conversation_stage = determineConversationStage({
    priorState: params.priorState,
    goalStatus: getConversationOutcomeState(reaction.updatedState),
    progress: params.progress,
    currentAnalysis: params.analysis,
  });
  reaction.updatedState.scenario_risk_level = deriveRiskLevel(reaction.updatedState);
  reaction.updatedState.emotional_state = reaction.updatedState.emotion_state;

  if (complaintOutcome.prematureClosureDetected) {
    reaction.updatedState.runtime_events = appendConversationRuntimeEvent(
      reaction.updatedState,
      buildPrematureClosureRuntimeEvent({
        state: reaction.updatedState,
        source: "state_manager",
        triggerSource: complaintOutcome.prematureClosureTriggerSource || "employee_transcript",
        triggerPhraseOrReason: complaintOutcome.prematureClosureReason || params.employeeMessage,
        summary: "Employee attempted to close or soften the conversation before the complaint was actually settled.",
      }),
    );
    applyRuntimeEvent(
      reaction.updatedState,
      "unresolved_gap_reopened",
      `The complaint stayed open because ${reaction.updatedState.subissues_open.slice(0, 3).join(", ") || "material gaps still remained"}.`,
    );
  }

  if (!terminalValidation.isTerminal && terminalValidation.blockedBy.length > 0) {
    const unresolvedEventType = complaintOutcome.outcomeState === "PARTIALLY_RESOLVED"
      ? "complaint_partially_addressed"
      : "unresolved_complaint_persists";
    applyRuntimeEvent(
      reaction.updatedState,
      unresolvedEventType,
      `Conversation remains open because ${terminalValidation.blockedBy.slice(0, 3).join(", ")}.`,
    );
  }

  if (reaction.updatedState.accepted_next_step) {
    applyRuntimeEvent(
      reaction.updatedState,
      "next_step_offered",
      "Employee offered a concrete next step that the customer could plausibly accept.",
    );
  } else if (
    params.analysis.explicitNextStep
    || params.analysis.explicitTimeline
    || params.analysis.explicitManagerMention
  ) {
    applyRuntimeEvent(
      reaction.updatedState,
      "next_step_rejected",
      "A next step was mentioned, but it was not concrete or credible enough to settle the complaint.",
    );
  }

  if (params.analysis.explicitManagerMention && !complaintOutcome.validRedirect) {
    applyRuntimeEvent(
      reaction.updatedState,
      "escalation_offered",
      "Employee mentioned escalation, but the handoff was not yet concrete enough to end the conversation.",
    );
  }

  if (pacingUpdate.shouldTimeoutFailure) {
    applyRuntimeEvent(
      reaction.updatedState,
      "timeout_failure",
      pacingUpdate.timeoutFailureSummary,
    );
  }

  if (terminalValidation.terminalEventType === "complaint_fully_resolved") {
    applyRuntimeEvent(reaction.updatedState, "complaint_fully_resolved", terminalValidation.terminalReason);
  } else if (terminalValidation.terminalEventType === "escalation_accepted") {
    applyRuntimeEvent(reaction.updatedState, "escalation_accepted", terminalValidation.terminalReason);
  } else if (terminalValidation.terminalEventType === "abandonment_detected") {
    applyRuntimeEvent(reaction.updatedState, "abandonment_detected", terminalValidation.terminalReason);
  }

  return reaction.updatedState;
}
