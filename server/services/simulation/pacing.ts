import type { ScenarioDirectorResult } from "../ai/contracts";
import type { EmployeeUtteranceAnalysis, SimulationStateDraft } from "./types";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalizedHiddenFactsCount(scenario: ScenarioDirectorResult) {
  return (scenario.hidden_facts || []).filter((fact) => fact && !/employee should|training|approved resolution|required behaviors/i.test(fact)).length;
}

function complaintStatusWeight(status?: string) {
  switch (status) {
    case "RESOLVED":
    case "ESCALATED":
      return 4;
    case "REDIRECT_PENDING":
    case "PARTIALLY_ADDRESSED":
      return 2;
    default:
      return 0;
  }
}

function countUnresolvedGaps(state: Pick<SimulationStateDraft, "subissues_open" | "unresolved_customer_questions" | "next_step_missing_fields" | "accepted_next_step" | "valid_redirect">) {
  return dedupeStrings([
    ...(state.subissues_open || []),
    ...(state.unresolved_customer_questions || []),
    ...((state.accepted_next_step || state.valid_redirect) ? (state.next_step_missing_fields || []).map((field) => `next step missing ${field}`) : []),
  ]).length;
}

function countClarifyingSignals(analysis: EmployeeUtteranceAnalysis) {
  return [
    analysis.explicitVerification,
    analysis.explicitExplanation,
    analysis.explicitDiscovery,
    analysis.explicitDirection,
    analysis.explicitRecommendation,
  ].filter(Boolean).length;
}

function detectMisunderstoodTurn(params: {
  analysis: EmployeeUtteranceAnalysis;
  priorState: SimulationStateDraft;
  currentState: SimulationStateDraft;
}) {
  return (
    params.analysis.answeredQuestion === false
    || params.analysis.avoidedQuestion
    || params.analysis.contradictionDetected
    || params.analysis.fakeConfidence
    || params.currentState.issue_clarity < params.priorState.issue_clarity
  );
}

function detectMeaningfulProgress(params: {
  analysis: EmployeeUtteranceAnalysis;
  priorState: SimulationStateDraft;
  currentState: SimulationStateDraft;
  priorGapCount: number;
  currentGapCount: number;
  discoveredFactsAdded: number;
}) {
  const statusImproved = complaintStatusWeight(params.currentState.complaint_status) > complaintStatusWeight(params.priorState.complaint_status);
  const unresolvedReduced = params.currentGapCount < params.priorGapCount;
  const clearerAnswer = params.currentState.issue_clarity > params.priorState.issue_clarity
    && params.analysis.answeredQuestion
    && !params.analysis.vaguenessDetected;
  const concretePathForward = (
    (params.currentState.accepted_next_step && !params.priorState.accepted_next_step)
    || (params.currentState.valid_redirect && !params.priorState.valid_redirect)
    || params.currentState.terminal_outcome_state === "RESOLVED"
    || params.currentState.terminal_outcome_state === "ESCALATED"
  );

  return statusImproved || unresolvedReduced || clearerAnswer || concretePathForward || params.discoveredFactsAdded > 0;
}

function buildPacingSummary(params: {
  state: SimulationStateDraft;
}) {
  const parts = [
    `complexity ${params.state.issue_complexity}/10`,
    `${params.state.unresolved_gap_count} open gap${params.state.unresolved_gap_count === 1 ? "" : "s"}`,
    `${params.state.no_progress_turns} stalled turn${params.state.no_progress_turns === 1 ? "" : "s"}`,
    `momentum ${params.state.resolution_momentum}/10`,
  ];
  if (params.state.misunderstood_turn_count > 0) {
    parts.push(`${params.state.misunderstood_turn_count} misunderstood turn${params.state.misunderstood_turn_count === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

export function inferIssueComplexity(scenario: ScenarioDirectorResult) {
  let complexity = 2;
  complexity += Math.min(3, normalizedHiddenFactsCount(scenario));
  complexity += Math.min(2, Math.max(0, (scenario.completion_criteria || []).length - 1));
  complexity += Math.min(2, Math.max(0, (scenario.hidden_facts || []).length - 1));

  if (["billing_confusion", "cancellation_request", "reservation_issue", "member_complaint"].includes(scenario.scenario_family || "")) {
    complexity += 1;
  }
  if (scenario.department === "mod_emergency" || scenario.scenario_family === "emergency_response") {
    complexity += 2;
  }

  return clamp(complexity, 2, 9);
}

export function buildInitialPacingState(scenario: ScenarioDirectorResult, state: Pick<SimulationStateDraft, "subissues_open" | "unresolved_customer_questions" | "next_step_missing_fields" | "accepted_next_step" | "valid_redirect">) {
  return {
    issue_complexity: inferIssueComplexity(scenario),
    clarification_depth: 0,
    trust_damage_count: 0,
    trust_recovery_count: 0,
    unresolved_gap_count: countUnresolvedGaps(state),
    misunderstood_turn_count: 0,
    follow_up_question_count: 0,
    resolution_momentum: 0,
    no_progress_turns: 0,
    stall_failure_risk: 0,
    pacing_summary: "",
  };
}

export function derivePacingUpdate(params: {
  scenario: ScenarioDirectorResult;
  priorState: SimulationStateDraft;
  currentState: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  latestCustomerMessage?: string;
}) {
  const priorGapCount = countUnresolvedGaps(params.priorState);
  const currentGapCount = countUnresolvedGaps(params.currentState);
  const trustDelta = params.currentState.trust_level - params.priorState.trust_level;
  const discoveredFactsAdded = Math.max(0, (params.currentState.discovered_facts || []).length - (params.priorState.discovered_facts || []).length);
  const misunderstoodTurn = detectMisunderstoodTurn({
    analysis: params.analysis,
    priorState: params.priorState,
    currentState: params.currentState,
  });
  const meaningfulProgress = detectMeaningfulProgress({
    analysis: params.analysis,
    priorState: params.priorState,
    currentState: params.currentState,
    priorGapCount,
    currentGapCount,
    discoveredFactsAdded,
  });
  const clarificationDepth = clamp(
    (params.priorState.clarification_depth || 0)
      + countClarifyingSignals(params.analysis)
      + (discoveredFactsAdded > 0 ? 1 : 0),
  );
  const trustDamageCount = (params.priorState.trust_damage_count || 0) + (trustDelta <= -1 ? 1 : 0);
  const trustRecoveryCount = (params.priorState.trust_recovery_count || 0) + (trustDelta >= 2 ? 1 : 0);
  const misunderstoodTurnCount = (params.priorState.misunderstood_turn_count || 0) + (misunderstoodTurn ? 1 : 0);
  const followUpQuestionCount = (params.priorState.follow_up_question_count || 0)
    + (params.latestCustomerMessage?.includes("?") ? 1 : 0);

  const progressBoost = (
    (currentGapCount < priorGapCount ? 2 : 0)
    + (params.currentState.issue_clarity > params.priorState.issue_clarity && params.analysis.answeredQuestion ? 1 : 0)
    + (discoveredFactsAdded > 0 ? 1 : 0)
    + (params.currentState.accepted_next_step || params.currentState.valid_redirect ? 2 : 0)
    + (params.currentState.terminal_outcome_state === "RESOLVED" || params.currentState.terminal_outcome_state === "ESCALATED" ? 3 : 0)
  );
  const drag = (
    (misunderstoodTurn ? 2 : 0)
    + (params.analysis.vaguenessDetected ? 1 : 0)
    + (params.analysis.deadEndLanguage ? 1 : 0)
    + (trustDelta < 0 ? 1 : 0)
    + (currentGapCount > priorGapCount ? 1 : 0)
  );

  const resolutionMomentum = clamp((params.priorState.resolution_momentum || 0) + progressBoost - drag);
  const noProgressTurns = params.currentState.complaint_still_open
    ? (meaningfulProgress ? 0 : (params.priorState.no_progress_turns || 0) + 1)
    : 0;
  const stallFailureRisk = clamp(
    (noProgressTurns * 2)
      + Math.min(3, currentGapCount)
      + (misunderstoodTurn ? 1 : 0)
      + (trustDamageCount > trustRecoveryCount ? 1 : 0)
      - Math.floor((params.priorState.issue_complexity || inferIssueComplexity(params.scenario)) / 4)
      - Math.floor(resolutionMomentum / 4),
  );
  const stallThreshold = 4
    + Math.floor((params.priorState.issue_complexity || inferIssueComplexity(params.scenario)) / 2);
  const shouldTimeoutFailure = params.currentState.complaint_still_open
    && noProgressTurns >= stallThreshold
    && resolutionMomentum <= 3;

  const nextState = {
    issue_complexity: params.priorState.issue_complexity || inferIssueComplexity(params.scenario),
    clarification_depth: clarificationDepth,
    trust_damage_count: trustDamageCount,
    trust_recovery_count: trustRecoveryCount,
    unresolved_gap_count: currentGapCount,
    misunderstood_turn_count: misunderstoodTurnCount,
    follow_up_question_count: followUpQuestionCount,
    resolution_momentum: resolutionMomentum,
    no_progress_turns: noProgressTurns,
    stall_failure_risk: stallFailureRisk,
    pacing_summary: "",
  };
  nextState.pacing_summary = buildPacingSummary({
    state: {
      ...params.currentState,
      ...nextState,
    },
  });

  return {
    ...nextState,
    meaningfulProgress,
    misunderstoodTurn,
    shouldTimeoutFailure,
    timeoutFailureSummary: shouldTimeoutFailure
      ? "The complaint stayed materially unresolved through repeated stalled turns, so the conversation timed out as an explicit failure."
      : "",
  };
}
