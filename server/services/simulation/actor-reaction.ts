import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";
import { evaluateConversationTerminalState, isTerminalConversationState } from "@shared/conversation-outcome";
import type {
  ActorResponseMode,
  ActorTurnInterpretation,
  CustomerHumanProfile,
  EmployeeUtteranceAnalysis,
  ServiceFailureLevel,
  SimulationStateDraft,
  TurnProgressSummary,
} from "./types";

function pickUnresolvedFocus(params: {
  state: SimulationStateDraft;
  progress: TurnProgressSummary;
  latestCustomerMessage?: string;
  analysis: EmployeeUtteranceAnalysis;
}) {
  if (params.state.no_progress_turns >= 2) {
    if (params.state.next_step_missing_fields.includes("timeline")) {
      return "When exactly does that happen?";
    }
    if (params.state.next_step_missing_fields.includes("owner")) {
      return "Who exactly owns this from here?";
    }
    if (params.state.next_step_missing_fields.includes("action")) {
      return "What is the actual next action from here?";
    }
    if (params.state.unresolved_customer_questions[0]) {
      return params.state.unresolved_customer_questions[0];
    }
  }
  return (
    params.progress.nextMissing?.ask[0]
    || params.state.unresolved_customer_questions[0]
    || (!params.analysis.answeredQuestion ? params.latestCustomerMessage : undefined)
    || params.state.unresolved_questions[0]
    || params.progress.nextMissing?.label
    || params.state.outcome_summary
    || params.state.customer_goal
  );
}

function normalizeTokens(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function detectEmployeeRepetition(transcript: TranscriptTurn[], analysis: EmployeeUtteranceAnalysis) {
  const recentEmployeeMessages = transcript
    .filter((turn) => turn.role === "employee")
    .slice(-3)
    .map((turn) => turn.message.trim())
    .filter(Boolean);

  if (recentEmployeeMessages.length < 2) {
    return false;
  }

  const latest = normalizeTokens(recentEmployeeMessages[recentEmployeeMessages.length - 1]);
  const prior = normalizeTokens(recentEmployeeMessages[recentEmployeeMessages.length - 2]);
  const overlap = latest.filter((token) => prior.includes(token));

  return overlap.length >= 3
    || recentEmployeeMessages.slice(0, -1).includes(recentEmployeeMessages[recentEmployeeMessages.length - 1])
    || (analysis.vaguenessDetected && analysis.likelyStalled);
}

function inferPerceivedCompetence(analysis: EmployeeUtteranceAnalysis): ActorTurnInterpretation["perceivedCompetence"] {
  if (
    analysis.accuracy <= 3
    || analysis.fakeConfidence
    || analysis.contradictionDetected
    || (analysis.answeredQuestion === false && analysis.helpfulness <= 4)
  ) {
    return "low";
  }
  if (analysis.accuracy >= 7 && analysis.clarity >= 7 && analysis.nextStepQuality >= 6) return "high";
  return "mixed";
}

function inferPerceivedCare(analysis: EmployeeUtteranceAnalysis): ActorTurnInterpretation["perceivedCare"] {
  if (analysis.disrespect || analysis.soundedDismissive || analysis.blameShifting) return "low";
  if (analysis.madeCustomerFeelHeard && analysis.tookOwnership) return "high";
  return "mixed";
}

function determineResponseMode(params: {
  profile: CustomerHumanProfile;
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  priorState: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  failureLevel: ServiceFailureLevel;
  unresolvedFocus: string;
  transcript: TranscriptTurn[];
}) : ActorResponseMode {
  const terminalValidation = evaluateConversationTerminalState(params.state);
  if (params.state.premature_closure_detected && !isTerminalConversationState(params.state)) {
    return "reopen_unresolved";
  }
  if (terminalValidation.isTerminal && terminalValidation.outcome === "ESCALATED") {
    return "close_out";
  }
  if (params.state.manager_request_level >= 8) {
    return "request_manager";
  }
  if (terminalValidation.isTerminal && terminalValidation.outcome === "RESOLVED") {
    return "close_out";
  }
  if (terminalValidation.isTerminal && (terminalValidation.outcome === "ABANDONED" || terminalValidation.outcome === "TIMED_OUT")) {
    return "disengage";
  }
  if (params.state.unresolved_subissues.length > 0 && (params.state.accepted_next_step || params.state.valid_redirect)) {
    return "reopen_unresolved";
  }
  if (
    params.analysis.disrespect
    || params.analysis.soundedRude
    || params.analysis.blameShifting
    || params.analysis.soundedDismissive
  ) {
    return params.state.manager_request_level >= 7 ? "request_manager" : "call_out_tone";
  }
  if (detectEmployeeRepetition(params.transcript, params.analysis)) {
    return params.state.trust_level <= 4 ? "call_out_repetition" : "confused_reopen";
  }
  if (params.failureLevel === "severe" || (params.analysis.fakeConfidence && params.analysis.accuracy <= 4)) {
    return "question_competence";
  }
  if (params.analysis.roboticPhrasing) {
    return params.state.trust_level <= 4 ? "skeptical_challenge" : "confused_reopen";
  }
  if (
    params.analysis.explicitNextStep
    && !params.analysis.tookOwnership
    && !params.state.accepted_next_step
  ) {
    return "press_for_ownership";
  }
  if (params.analysis.answeredQuestion === false || params.analysis.vaguenessDetected) {
    return params.state.issue_clarity <= 4 ? "confused_reopen" : "skeptical_challenge";
  }
  if (
    params.analysis.explicitDirection
    && params.state.urgency_level >= 7
    && params.scenario.department === "mod_emergency"
  ) {
    return "follow_direction";
  }
  if (params.state.no_progress_turns >= 2 || params.state.misunderstood_turn_count >= 2) {
    return params.state.trust_level <= 3 ? "question_competence" : "reopen_unresolved";
  }
  if (
    params.analysis.helpfulness >= 7
    && params.analysis.tookOwnership
    && (params.analysis.explicitExplanation || params.analysis.explicitVerification || params.progress.newlyCompleted.length > 0)
    && params.state.unresolved_subissues.length > 0
    && !params.analysis.vaguenessDetected
    && !params.analysis.avoidedQuestion
  ) {
    return "tentative_soften";
  }
  if (
    params.analysis.helpfulness >= 7
    && params.analysis.tookOwnership
    && (params.analysis.explicitNextStep || params.analysis.explicitTimeline || params.state.accepted_next_step)
    && params.state.unresolved_subissues.length === 0
  ) {
    return params.state.trust_level <= params.priorState.trust_level + 1 ? "tentative_soften" : "seek_specific_answer";
  }
  return "seek_specific_answer";
}

export function interpretActorTurn(params: {
  profile: CustomerHumanProfile;
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  priorState: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  transcript: TranscriptTurn[];
  failureLevel: ServiceFailureLevel;
}): ActorTurnInterpretation {
  const latestCustomerMessage = [...params.transcript].reverse().find((turn) => turn.role === "customer")?.message;
  const unresolvedFocus = pickUnresolvedFocus({
    state: params.state,
    progress: params.progress,
    latestCustomerMessage,
    analysis: params.analysis,
  });
  const trustDirection =
    params.state.trust_level > params.priorState.trust_level ? "up"
      : params.state.trust_level < params.priorState.trust_level ? "down"
        : "flat";
  const clarityDirection =
    params.state.issue_clarity > params.priorState.issue_clarity ? "up"
      : params.state.issue_clarity < params.priorState.issue_clarity ? "down"
        : "flat";
  const perceivedCompetence = inferPerceivedCompetence(params.analysis);
  const perceivedCare = inferPerceivedCare(params.analysis);
  const employeeRepeatedThemselves = detectEmployeeRepetition(params.transcript, params.analysis);
  const soundedScripted =
    params.analysis.roboticPhrasing
    || params.analysis.overTalking
    || (params.analysis.empathy >= 6 && !params.analysis.explicitNextStep && !params.analysis.explicitTimeline && !params.analysis.tookOwnership);
  const feltHeard = params.analysis.madeCustomerFeelHeard && params.analysis.answeredQuestion && !params.analysis.vaguenessDetected;
  const feltBrushedOff =
    params.analysis.soundedDismissive
    || params.analysis.deadEndLanguage
    || params.analysis.blameShifting
    || (params.analysis.explicitClosureAttempt && !isTerminalConversationState(params.state))
    || (!params.analysis.answeredQuestion && params.analysis.helpfulness <= 4);
  const canAcceptResolution =
    isTerminalConversationState(params.state)
    || (
      params.state.accepted_next_step
      && params.state.unmet_completion_criteria.length === 0
      && params.state.unresolved_subissues.length === 0
      && (params.state.valid_redirect || params.analysis.explicitNextStep || params.analysis.explicitTimeline)
    );
  const shouldReopen =
    params.state.premature_closure_detected
    || (!canAcceptResolution && params.analysis.explicitClosureAttempt)
    || (!params.state.valid_redirect && params.analysis.explicitManagerMention && params.analysis.explicitClosureAttempt);
  const shouldPush =
    params.failureLevel !== "none"
    || trustDirection === "down"
    || clarityDirection === "down"
    || !params.analysis.answeredQuestion;
  const shouldChallenge =
    params.analysis.disrespect
    || params.analysis.blameShifting
    || params.analysis.fakeConfidence
    || soundedScripted;
  const stillMissing = Array.from(new Set([
    ...(params.state.unresolved_subissues || []),
    ...(params.state.unresolved_customer_questions || []),
    ...(params.state.next_step_missing_fields || []).map((field) => `next step ${field}`),
  ])).slice(0, 4);
  const needsOwnership = params.state.complaint_still_open && !params.analysis.tookOwnership && !params.state.accepted_next_step;
  const shouldInterrupt = (
    params.profile.interruptionStyle === "frequent"
    || params.state.offense_level >= 6
    || params.state.urgency_level >= 8
  ) && !canAcceptResolution;
  const shouldRepeatConcern = employeeRepeatedThemselves || params.state.no_progress_turns >= 2 || (!params.analysis.answeredQuestion && params.state.trust_level <= 4);
  const shouldAnswerIndirectly = params.profile.indirectnessStyle === "high" && (params.state.issue_clarity <= 6 || trustDirection !== "up");
  const shouldUseSarcasm = params.profile.sarcasmStyle !== "none" && params.state.offense_level >= 6 && params.state.trust_level <= 3;

  const responseMode = determineResponseMode({
    profile: params.profile,
    scenario: params.scenario,
    state: params.state,
    priorState: params.priorState,
    analysis: params.analysis,
    progress: params.progress,
    failureLevel: params.failureLevel,
    unresolvedFocus,
    transcript: params.transcript,
  });

  const pushbackReason = params.analysis.disrespect
    ? "the employee's tone felt disrespectful"
    : employeeRepeatedThemselves
      ? "the employee keeps repeating themselves without moving the issue forward"
    : params.analysis.blameShifting
      ? "the employee sounded like they were pushing the problem back on the customer"
      : params.analysis.fakeConfidence
        ? "the employee sounded sure without earning that confidence"
        : soundedScripted
          ? "the employee sounded canned instead of real"
          : params.analysis.answeredQuestion === false
            ? "the employee still has not answered the actual question"
            : params.analysis.vaguenessDetected
              ? "the employee is still being vague"
              : "important details are still missing";

  return {
    answeredActualQuestion: params.analysis.answeredQuestion,
    trustDirection,
    clarityDirection,
    perceivedCompetence,
    perceivedCare,
    soundedScripted,
    feltHeard,
    feltBrushedOff,
    employeeRepeatedThemselves,
    needsOwnership,
    stillMissing,
    unresolvedFocus,
    pushbackReason,
    canAcceptResolution,
    shouldReopen,
    shouldPush,
    shouldChallenge,
    shouldInterrupt,
    shouldRepeatConcern,
    shouldAnswerIndirectly,
    shouldUseSarcasm,
    responseMode,
  };
}
