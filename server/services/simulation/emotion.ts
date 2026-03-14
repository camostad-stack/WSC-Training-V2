import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";
import { evaluateConversationTerminalState, isTerminalConversationState } from "@shared/conversation-outcome";
import { buildPersonaReactionProfile } from "./personas";
import type {
  CustomerStrategy,
  EmotionalReactionResult,
  EmotionalReactionThresholds,
  EmployeeUtteranceAnalysis,
  LikelyNextCustomerBehavior,
  ServiceFailureLevel,
  SimulationStateDraft,
} from "./types";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isUrgentScenario(scenario: ScenarioDirectorResult) {
  return scenario.department === "mod_emergency"
    || ["slippery_entry_complaint", "unsafe_equipment_report", "weather_range_incident", "emergency_response"].includes(scenario.scenario_family);
}

function countRecentWeakTurns(transcript: TranscriptTurn[], employeeMessages: string[]) {
  const recentEmployeeTurns = transcript
    .filter((turn) => turn.role === "employee")
    .slice(-3)
    .map((turn) => turn.message.trim().toLowerCase());
  const current = employeeMessages.slice(-3).map((message) => message.trim().toLowerCase());
  return recentEmployeeTurns.filter((message) => current.includes(message)).length;
}

export const EMOTIONAL_REACTION_THRESHOLDS: EmotionalReactionThresholds = {
  helpfulCalmMin: 7,
  ownershipTrustMin: 6,
  fakeConfidencePenaltyMaxAccuracy: 4,
  disrespectEscalationMin: 6,
  confusionSpikeMinContradictions: 1,
  managerRequestTrustMax: 3,
  disengageHelpfulnessMax: 3,
  disengageRepeatWeakTurns: 2,
};

function assessServiceFailure(params: {
  analysis: EmployeeUtteranceAnalysis;
  repeatedWeakResponses: number;
  priorState: SimulationStateDraft;
}): { level: ServiceFailureLevel; reason: string } {
  const severe =
    params.analysis.soundedRude
    || params.analysis.blameShifting
    || (params.analysis.disrespect && params.analysis.blameShifting)
    || (params.analysis.fakeConfidence && params.analysis.accuracy <= 2)
    || (params.analysis.policyMisuse && params.analysis.helpfulness <= 3)
    || (params.analysis.deadEndLanguage && !params.analysis.tookOwnership);
  if (severe) {
    return {
      level: "severe",
      reason: "the employee sounded disrespectful, clearly incompetent, or fully unhelpful",
    };
  }

  const moderate =
    params.analysis.soundedDismissive
    || params.analysis.soundedRude
    || params.analysis.blameShifting
    || params.analysis.fakeConfidence
    || params.analysis.contradictionDetected
    || (params.analysis.avoidedQuestion && params.analysis.vaguenessDetected && params.repeatedWeakResponses >= 1)
    || params.repeatedWeakResponses >= EMOTIONAL_REACTION_THRESHOLDS.disengageRepeatWeakTurns
    || (params.priorState.trust_level <= 2 && params.analysis.helpfulness <= 4);
  if (moderate) {
    return {
      level: "moderate",
      reason: "the employee came across as vague, dismissive, or less trustworthy",
    };
  }

  const mild =
    params.analysis.vaguenessDetected
    || params.analysis.roboticPhrasing
    || !params.analysis.answeredQuestion
    || !params.analysis.tookOwnership
    || !params.analysis.setExpectationsClearly;
  if (mild) {
    return {
      level: "mild",
      reason: "the employee still left important gaps or sounded weak",
    };
  }

  return {
    level: "none",
    reason: "the employee response stayed within normal service expectations",
  };
}

export function buildNegativeCustomerReaction(params: {
  scenario: ScenarioDirectorResult;
  priorState: SimulationStateDraft;
  state: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  recentConversationHistory: TranscriptTurn[];
}): {
  failureLevel: ServiceFailureLevel;
  reason: string;
  sampleReaction: string;
} {
  const profile = buildPersonaReactionProfile({
    communicationStyle: params.scenario.customer_persona.communication_style,
    patienceLabel: params.scenario.customer_persona.patience_level,
    initialEmotion: params.scenario.customer_persona.initial_emotion,
  });
  const repeatedWeakResponses = countRecentWeakTurns(
    params.recentConversationHistory,
    params.recentConversationHistory.filter((turn) => turn.role === "employee").map((turn) => turn.message),
  );
  const failure = assessServiceFailure({
    analysis: params.analysis,
    repeatedWeakResponses,
    priorState: params.priorState,
  });

  if (failure.level === "none") {
    return {
      failureLevel: failure.level,
      reason: failure.reason,
      sampleReaction: "",
    };
  }

  if (failure.level === "severe") {
    if (profile.defaultNegativeStyle === "quiet_withdrawal") {
      return {
        failureLevel: failure.level,
        reason: failure.reason,
        sampleReaction: "Okay. I need a manager, because this is not being handled well.",
      };
    }
    if (profile.defaultNegativeStyle === "measured_skepticism") {
      return {
        failureLevel: failure.level,
        reason: failure.reason,
        sampleReaction: "That does not sound right, and I do not trust this answer. I want a manager involved.",
      };
    }
    return {
      failureLevel: failure.level,
      reason: failure.reason,
      sampleReaction: "No. That is not okay. If this is the answer, I want a manager now.",
    };
  }

  if (failure.level === "moderate") {
    if (profile.defaultNegativeStyle === "quiet_withdrawal") {
      return {
        failureLevel: failure.level,
        reason: failure.reason,
        sampleReaction: "I still do not feel like I am getting a straight answer here.",
      };
    }
    if (profile.defaultNegativeStyle === "measured_skepticism") {
      return {
        failureLevel: failure.level,
        reason: failure.reason,
        sampleReaction: "I am not following why I should trust that. What are you actually doing?",
      };
    }
    return {
      failureLevel: failure.level,
      reason: failure.reason,
      sampleReaction: "You are not really answering me. What is the actual next step?",
    };
  }

  if (profile.defaultNegativeStyle === "quiet_withdrawal") {
    return {
      failureLevel: failure.level,
      reason: failure.reason,
      sampleReaction: "Can you be more specific, please?",
    };
  }
  if (profile.defaultNegativeStyle === "measured_skepticism") {
    return {
      failureLevel: failure.level,
      reason: failure.reason,
      sampleReaction: "That still feels a little vague. What exactly happens next?",
    };
  }
  return {
    failureLevel: failure.level,
    reason: failure.reason,
    sampleReaction: "I still need a clearer answer than that.",
  };
}

function determineEmotionLabel(params: {
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  priorState: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  likelyNextBehavior: LikelyNextCustomerBehavior;
}) {
  const terminalValidation = evaluateConversationTerminalState(params.state);
  if (terminalValidation.isTerminal && terminalValidation.outcome === "RESOLVED") return isUrgentScenario(params.scenario) ? "steady" : "reassured";
  if (terminalValidation.isTerminal && terminalValidation.outcome === "ESCALATED") return isUrgentScenario(params.scenario) ? "alarmed" : "upset";
  if (terminalValidation.isTerminal && (terminalValidation.outcome === "ABANDONED" || terminalValidation.outcome === "TIMED_OUT")) {
    return params.state.offense_level >= 6 ? "withdrawn" : "done";
  }
  if (
    params.analysis.contradictionDetected
    || ((params.analysis.accuracy <= 4 || params.analysis.fakeConfidence) && params.state.issue_clarity <= 5)
    || (params.analysis.accuracy <= 4 && params.analysis.clarity <= 4)
  ) {
    return "confused";
  }
  if (isUrgentScenario(params.scenario) && params.analysis.tookOwnership && params.analysis.helpfulness >= 6) {
    return params.analysis.explicitDirection ? "steady" : "concerned";
  }
  if (params.analysis.helpfulness >= EMOTIONAL_REACTION_THRESHOLDS.helpfulCalmMin && params.state.trust_level >= 5) {
    return isUrgentScenario(params.scenario) ? "steady" : "calmer";
  }
  if (params.likelyNextBehavior === "request_manager") return isUrgentScenario(params.scenario) ? "alarmed" : "upset";
  if (params.likelyNextBehavior === "disengage") return params.state.offense_level >= 6 ? "withdrawn" : "done";
  if (params.analysis.explicitDisrespect || params.state.offense_level >= 7) return params.state.manager_request_level >= 7 ? "offended" : "defensive";
  if (params.state.trust_level <= 3) return isUrgentScenario(params.scenario) ? "concerned" : "guarded";
  return params.priorState.emotion_state || "concerned";
}

function determineLikelyNextBehavior(params: {
  state: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  quietWithdrawal: boolean;
}): LikelyNextCustomerBehavior {
  const terminalValidation = evaluateConversationTerminalState(params.state);
  if (terminalValidation.isTerminal && terminalValidation.outcome === "RESOLVED") return "close_conversation";
  if (terminalValidation.isTerminal && terminalValidation.outcome === "ESCALATED") return "request_manager";
  if (terminalValidation.isTerminal && (terminalValidation.outcome === "ABANDONED" || terminalValidation.outcome === "TIMED_OUT")) return "disengage";
  if (params.state.no_progress_turns >= 2 && params.state.complaint_still_open) {
    return params.state.trust_level <= 3 ? "become_cautious" : "ask_follow_up";
  }
  if (params.state.unresolved_subissues.length > 0 && (params.state.accepted_next_step || params.state.valid_redirect)) {
    return "ask_follow_up";
  }
  if (params.state.manager_request_level >= 7 && params.state.offense_level >= 5) return "request_manager";
  if (params.state.cooperation_level <= 2 || params.state.patience_level <= 1) {
    return params.quietWithdrawal || params.state.offense_level <= 4 ? "disengage" : "request_manager";
  }
  if (params.state.offense_level >= 6) return "become_defensive";
  if (params.analysis.avoidedQuestion || params.state.issue_clarity <= 4) return "ask_follow_up";
  if (params.state.trust_level <= 4) return "become_cautious";
  if (params.analysis.explicitDirection && params.state.urgency_level >= 7) return "follow_instructions";
  return "stay_engaged";
}

function determineResponseStrategy(params: {
  state: SimulationStateDraft;
  likelyNextBehavior: LikelyNextCustomerBehavior;
  analysis: EmployeeUtteranceAnalysis;
  scenario: ScenarioDirectorResult;
}): CustomerStrategy {
  const terminalValidation = evaluateConversationTerminalState(params.state);
  if (terminalValidation.isTerminal && terminalValidation.outcome === "RESOLVED") return "close_out";
  if (terminalValidation.isTerminal && terminalValidation.outcome === "ESCALATED") return "request_manager";
  if (terminalValidation.isTerminal && (terminalValidation.outcome === "ABANDONED" || terminalValidation.outcome === "TIMED_OUT")) return "protect_dignity";
  if (params.state.unresolved_subissues.length > 0 && (params.state.accepted_next_step || params.state.valid_redirect)) {
    return "press_for_specifics";
  }
  if (params.likelyNextBehavior === "request_manager") return "request_manager";
  if (params.likelyNextBehavior === "disengage") return "protect_dignity";
  if (params.likelyNextBehavior === "become_defensive") return "protect_dignity";
  if (params.state.urgency_level >= 8 && !params.analysis.explicitDirection) return "seek_action";
  if ((params.analysis.madeCustomerFeelHeard || params.analysis.helpfulness >= 7) && !params.analysis.setExpectationsClearly) return "press_for_specifics";
  if (params.analysis.helpfulness <= 4 || params.analysis.avoidedQuestion) return "seek_clarity";
  if (params.scenario.department === "golf" && !params.analysis.explicitDiscovery) return "seek_clarity";
  return "seek_reassurance";
}

function buildShiftExplanation(params: {
  priorState: SimulationStateDraft;
  state: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  likelyNextBehavior: LikelyNextCustomerBehavior;
}) {
  const reasons: string[] = [];

  if (params.state.trust_level > params.priorState.trust_level) reasons.push("trust increased because the employee sounded more helpful and accountable");
  if (params.state.trust_level < params.priorState.trust_level) reasons.push("trust dropped because the employee sounded less reliable");
  if (params.state.offense_level > params.priorState.offense_level) reasons.push("offense increased because the response felt disrespectful or blaming");
  if (params.state.issue_clarity < params.priorState.issue_clarity) reasons.push("confusion increased because the answer did not clarify what happens next");
  if (params.analysis.fakeConfidence) reasons.push("confidence felt performative without enough substance");
  if (params.analysis.madeCustomerFeelHeard) reasons.push("the customer felt more heard");
  if (params.analysis.contradictionDetected) reasons.push("a contradiction made the answer harder to trust");
  if (params.state.no_progress_turns >= 2) reasons.push("the issue is still circling without enough real progress");
  if (params.likelyNextBehavior === "request_manager") reasons.push("the customer is close to asking for a manager");
  if (params.likelyNextBehavior === "disengage") reasons.push("the conversation feels unproductive to the customer");

  return reasons[0] ? reasons.join("; ") : "state changed only slightly because the response was mixed";
}

export function applyEmotionalReaction(params: {
  scenario: ScenarioDirectorResult;
  priorState: SimulationStateDraft;
  draftState: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  recentConversationHistory: TranscriptTurn[];
}): EmotionalReactionResult {
  const profile = buildPersonaReactionProfile({
    communicationStyle: params.scenario.customer_persona.communication_style,
    patienceLabel: params.scenario.customer_persona.patience_level,
    initialEmotion: params.scenario.customer_persona.initial_emotion,
  });
  const repeatedWeakResponses = countRecentWeakTurns(params.recentConversationHistory, params.recentConversationHistory.filter((turn) => turn.role === "employee").map((turn) => turn.message));

  const failure = assessServiceFailure({
    analysis: params.analysis,
    repeatedWeakResponses,
    priorState: params.priorState,
  });
  const strongRecovery =
    params.analysis.tookOwnership
    && params.analysis.helpfulness >= 7
    && (params.analysis.explicitNextStep || params.analysis.explicitTimeline || params.analysis.explicitManagerMention);
  const calmDelta = strongRecovery ? 2 : params.analysis.helpfulness >= EMOTIONAL_REACTION_THRESHOLDS.helpfulCalmMin ? 1 : 0;
  const trustDelta = (params.analysis.tookOwnership && params.analysis.ownership >= EMOTIONAL_REACTION_THRESHOLDS.ownershipTrustMin ? 1 : 0)
    + (strongRecovery ? 1 : 0)
    - (params.analysis.roboticPhrasing ? 1 : 0)
    - (params.analysis.fakeConfidence && params.analysis.accuracy <= EMOTIONAL_REACTION_THRESHOLDS.fakeConfidencePenaltyMaxAccuracy ? 2 + profile.trustSensitivity : 0);
  const confusionDelta = (params.analysis.contradictionDetected ? 2 + profile.confusionSensitivity : 0)
    + (params.analysis.vaguenessDetected ? 1 + profile.confusionSensitivity : 0)
    - (params.analysis.clarity >= 7 ? 1 : 0);
  const offenseDelta = (params.analysis.disrespect ? 2 + profile.offenseSensitivity : 0)
    + (params.analysis.blameShifting ? 1 + profile.offenseSensitivity : 0)
    - (params.analysis.empathy >= 7 ? 1 : 0);
  const managerDelta = (params.analysis.disrespect ? 3 + profile.escalationSensitivity : 0)
    + (params.analysis.fakeConfidence ? 1 : 0)
    + (params.analysis.blameShifting ? 1 : 0)
    - (params.analysis.tookOwnership ? 1 : 0)
    - (strongRecovery ? 2 : 0);
  const cooperationDelta = (params.analysis.madeCustomerFeelHeard ? 1 : 0)
    - (params.analysis.avoidedQuestion ? 1 : 0)
    - (repeatedWeakResponses >= EMOTIONAL_REACTION_THRESHOLDS.disengageRepeatWeakTurns ? 1 + profile.disengagementSensitivity : 0);
  const patienceDelta = params.analysis.helpfulness >= 6 ? 0 : -(1 + profile.patienceModifier);

  const updatedState: SimulationStateDraft = {
    ...params.draftState,
    trust_level: clamp(params.draftState.trust_level + trustDelta),
    issue_clarity: clamp(params.draftState.issue_clarity - confusionDelta + (params.analysis.clarity >= 7 ? 1 : 0)),
    offense_level: clamp(params.draftState.offense_level + offenseDelta - calmDelta),
    manager_request_level: clamp(params.draftState.manager_request_level + managerDelta),
    cooperation_level: clamp(params.draftState.cooperation_level + cooperationDelta),
    patience_level: clamp(params.draftState.patience_level + patienceDelta, 0, 10),
  } as SimulationStateDraft;

  if (params.analysis.helpfulness <= EMOTIONAL_REACTION_THRESHOLDS.disengageHelpfulnessMax && repeatedWeakResponses >= EMOTIONAL_REACTION_THRESHOLDS.disengageRepeatWeakTurns) {
    updatedState.cooperation_level = clamp(updatedState.cooperation_level - 1 - profile.disengagementSensitivity);
  }

  if (profile.seeksManagerEarly && updatedState.offense_level >= EMOTIONAL_REACTION_THRESHOLDS.disrespectEscalationMin) {
    updatedState.manager_request_level = clamp(updatedState.manager_request_level + 1);
  }
  if (updatedState.trust_level <= EMOTIONAL_REACTION_THRESHOLDS.managerRequestTrustMax && (params.analysis.fakeConfidence || params.analysis.disrespect)) {
    updatedState.manager_request_level = clamp(updatedState.manager_request_level + 1);
  }

  const likelyNextBehavior = determineLikelyNextBehavior({
    state: updatedState,
    analysis: params.analysis,
    quietWithdrawal: profile.quietWithdrawal,
  });
  const responseStrategy = determineResponseStrategy({
    state: updatedState,
    likelyNextBehavior,
    analysis: params.analysis,
    scenario: params.scenario,
  });

  updatedState.customer_strategy = responseStrategy;
  updatedState.likely_next_behavior = likelyNextBehavior;
  updatedState.escalation_required = updatedState.goal_status === "ESCALATED" || updatedState.manager_request_level >= 7;
  updatedState.continue_simulation = !isTerminalConversationState(updatedState);
  updatedState.emotion_state = determineEmotionLabel({
    scenario: params.scenario,
    state: updatedState,
    priorState: params.priorState,
    analysis: params.analysis,
    likelyNextBehavior,
  });
  updatedState.emotional_shift_explanation = buildShiftExplanation({
    priorState: params.priorState,
    state: updatedState,
    analysis: params.analysis,
    likelyNextBehavior,
  });

  return {
    updatedState,
    emotionalShiftExplanation: updatedState.emotional_shift_explanation,
    likelyNextBehavior,
    responseStrategy,
    serviceFailureLevel: failure.level,
    negativeReactionReason: failure.reason,
  };
}
