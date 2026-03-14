import type {
  CoachingNote,
  EvaluationResult,
  ManagerDebrief,
  SimulationStateSnapshot,
} from "./types";

type AnalysisLike = Partial<{
  summary: string;
  serviceSummary: string;
  soundedDismissive: boolean;
  soundedRude: boolean;
  vaguenessDetected: boolean;
  policyMisuse: boolean;
  tookOwnership: boolean;
  madeCustomerFeelHeard: boolean;
  explicitNextStep: boolean;
  explicitTimeline: boolean;
  explicitManagerMention: boolean;
  explicitClosureAttempt: boolean;
  roboticPhrasing: boolean;
  contradictionDetected: boolean;
}>;

export interface DebriefMoment {
  turn: number;
  title: string;
  detail: string;
}

export interface PrematureClosureReview {
  turn: number;
  trigger: string;
  unresolvedGaps: string[];
  customerReaction: string;
  recovery: string;
}

export interface PostCallDebrief {
  outcomeState: string;
  isActuallyResolved: boolean;
  hasValidNextStep: boolean;
  escalationWasValid: boolean;
  prematureClosureAttempted: boolean;
  prematureClosureAttempts: PrematureClosureReview[];
  unmetCompletionCriteria: string[];
  unresolvedQuestions: string[];
  outcomeSummary: string;
  strongestPositiveBehaviors: string[];
  customerStillNeeded: string[];
  whyThisDidOrDidNotCountAsComplete: string;
  whereTrustMoved: string[];
  emotionalProgression: string[];
  whatChangedCustomerTone: string[];
  missedMoments: DebriefMoment[];
  bestRecoveryMoment: string | null;
  polishedButUnresolved: boolean;
  unresolvedTooLong: boolean;
  reliedOnVagueFollowUp: boolean;
  policyWithoutOwnership: boolean;
  recommendedReplayFocus: string[];
  interactionVsOutcomeNote: string;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function formatStateLabel(value?: string | null) {
  if (!value) return "--";
  return value.replace(/_/g, " ").toLowerCase();
}

function readAnalysis(state?: SimulationStateSnapshot | null): AnalysisLike {
  const raw = state?.latest_employee_analysis;
  if (!raw || typeof raw !== "object") return {};
  return raw as AnalysisLike;
}

function buildTrustDeltaSummary(history: SimulationStateSnapshot[]) {
  if (history.length === 0) {
    return {
      lines: ["Trust progression is not available for this session."],
      largestDrop: null as DebriefMoment | null,
      largestGain: null as DebriefMoment | null,
    };
  }

  const first = history[0];
  const last = history[history.length - 1];
  const start = first.trust_level ?? 0;
  const end = last.trust_level ?? 0;
  let largestDrop: DebriefMoment | null = null;
  let largestGain: DebriefMoment | null = null;
  let largestDropDelta = 0;
  let largestGainDelta = 0;

  for (let index = 1; index < history.length; index++) {
    const current = history[index];
    const previous = history[index - 1];
    const delta = (current.trust_level ?? 0) - (previous.trust_level ?? 0);
    const analysis = readAnalysis(current);

    if (delta <= -2 && delta < largestDropDelta) {
      largestDrop = {
        turn: current.turn_number ?? index + 1,
        title: "Trust dropped",
        detail:
          analysis.soundedDismissive
            ? "Trust dropped when the answer felt dismissive."
            : analysis.vaguenessDetected
              ? "Trust dropped after a vague answer that did not move the issue forward."
              : analysis.roboticPhrasing
                ? "Trust dropped when the answer sounded scripted instead of grounded."
                : analysis.contradictionDetected
                  ? "Trust dropped when the answer created more confusion."
                  : "Trust dropped after a weaker turn.",
      };
      largestDropDelta = delta;
    }

    if (delta >= 2 && delta > largestGainDelta) {
      largestGain = {
        turn: current.turn_number ?? index + 1,
        title: "Trust recovered",
        detail:
          analysis.tookOwnership && (analysis.explicitNextStep || analysis.explicitTimeline)
            ? "Trust improved when you named the owner, action, and next step."
            : analysis.madeCustomerFeelHeard
              ? "Trust improved when the customer felt heard and the answer became clearer."
              : "Trust improved after a stronger, more usable answer.",
      };
      largestGainDelta = delta;
    }
  }

  const lines = [
    `Trust started at ${start}/10 and ended at ${end}/10.`,
    largestDrop ? `Biggest trust drop: turn ${largestDrop.turn}. ${largestDrop.detail}` : null,
    largestGain ? `Best trust gain: turn ${largestGain.turn}. ${largestGain.detail}` : null,
  ];

  return {
    lines: unique(lines),
    largestDrop,
    largestGain,
  };
}

function buildEmotionSummary(history: SimulationStateSnapshot[]) {
  if (history.length === 0) {
    return ["Customer tone progression is not available for this session."];
  }

  const first = history[0];
  const last = history[history.length - 1];
  const transitions: string[] = [
    `Customer moved from ${formatStateLabel(first.emotional_state || first.emotion_state)} to ${formatStateLabel(last.emotional_state || last.emotion_state)}.`,
  ];

  for (let index = 1; index < history.length; index++) {
    const current = history[index];
    const previous = history[index - 1];
    const currentEmotion = current.emotional_state || current.emotion_state;
    const previousEmotion = previous.emotional_state || previous.emotion_state;
    if (currentEmotion && previousEmotion && currentEmotion !== previousEmotion) {
      const analysis = readAnalysis(current);
      transitions.push(
        `Turn ${current.turn_number ?? index + 1}: tone shifted from ${formatStateLabel(previousEmotion)} to ${formatStateLabel(currentEmotion)}${analysis.summary ? ` after ${analysis.summary.toLowerCase()}` : "."}`,
      );
    }
  }

  return unique(transitions).slice(0, 4);
}

function buildCustomerStillNeeded(finalState: SimulationStateSnapshot) {
  const items = unique([
    ...(finalState.unresolved_questions || []),
    ...(finalState.unmet_completion_criteria || []),
    !finalState.accepted_next_step && !finalState.valid_redirect
      ? "A concrete next step with an owner and timeline."
      : null,
  ]);

  return items.slice(0, 5);
}

function getRuntimeEvents(finalState?: SimulationStateSnapshot | null) {
  return (finalState?.runtime_events || []).filter(Boolean);
}

function buildCompletionExplanation(finalState: SimulationStateSnapshot) {
  const outcomeState = finalState.terminal_outcome_state || finalState.issue_progress_state || finalState.goal_status || "ACTIVE";
  const unmet = finalState.unmet_completion_criteria || [];

  if (outcomeState === "RESOLVED" && unmet.length === 0) {
    return "This counted as complete because the issue landed in a concrete resolution and no completion criteria were left open.";
  }

  if (outcomeState === "ESCALATED" && finalState.valid_redirect && finalState.accepted_next_step && unmet.length === 0) {
    return "This counted as complete because the escalation named who takes over, what happens next, and when the customer should expect movement.";
  }

  if (outcomeState === "ABANDONED") {
    return "This did not end as a success. The conversation broke down before the customer had a workable outcome or accepted handoff.";
  }

  if (outcomeState === "TIMED_OUT") {
    return "This did not end as a success. The issue was still open when the call timed out without a concrete accepted path forward.";
  }

  const blockers = unique([
    ...unmet,
    ...(finalState.completion_blockers || []),
    !finalState.accepted_next_step && !finalState.valid_redirect ? "There was no accepted next step or valid redirect." : null,
  ]);

  if (outcomeState === "PARTIALLY_RESOLVED") {
    return `This did not count as complete. The conversation moved forward, but it still ended with gaps: ${blockers.slice(0, 2).join("; ")}.`;
  }

  if (outcomeState === "ESCALATED") {
    return `This did not count as a valid escalation yet. It was missing something concrete: ${blockers.slice(0, 2).join("; ")}.`;
  }

  return `This stayed open because the customer still needed more: ${blockers.slice(0, 2).join("; ")}.`;
}

function buildToneChangeSummary(history: SimulationStateSnapshot[]) {
  const changes: string[] = [];

  for (let index = 1; index < history.length; index++) {
    const current = history[index];
    const previous = history[index - 1];
    const analysis = readAnalysis(current);
    const trustDelta = (current.trust_level ?? 0) - (previous.trust_level ?? 0);
    const confusionDelta = (current.issue_clarity ?? 0) - (previous.issue_clarity ?? 0);

    if (analysis.vaguenessDetected && trustDelta <= -1) {
      changes.push(`Turn ${current.turn_number ?? index + 1}: a vague follow-up made the customer more skeptical.`);
    }
    if (analysis.policyMisuse && !analysis.tookOwnership) {
      changes.push(`Turn ${current.turn_number ?? index + 1}: policy language without ownership hardened the customer’s tone.`);
    }
    if (analysis.madeCustomerFeelHeard && confusionDelta >= 1) {
      changes.push(`Turn ${current.turn_number ?? index + 1}: the tone softened once the answer became clearer and the customer felt heard.`);
    }
    if (analysis.soundedDismissive || analysis.soundedRude) {
      changes.push(`Turn ${current.turn_number ?? index + 1}: the customer reacted to the tone, not just the content.`);
    }
  }

  return unique(changes).slice(0, 4);
}

function describeCustomerReaction(state?: SimulationStateSnapshot | null) {
  if (!state) {
    return "The customer kept the issue open instead of accepting the wrap-up.";
  }

  switch (state.likely_next_behavior) {
    case "request_manager":
      return "The customer pushed harder and started leaning toward escalation.";
    case "become_defensive":
      return "The customer got more defensive after the attempted close.";
    case "become_cautious":
      return "The customer became more skeptical and needed more proof.";
    case "ask_follow_up":
      return "The customer reopened the gap and asked for what was still missing.";
    case "stay_engaged":
      return "The customer stayed engaged but would not let the issue close yet.";
    default:
      return state.emotional_state || state.emotion_state
        ? `The customer stayed ${formatStateLabel(state.emotional_state || state.emotion_state)} and kept pressing for clarity.`
        : "The customer kept the issue open instead of accepting the wrap-up.";
  }
}

function buildPrematureClosureAttempts(history: SimulationStateSnapshot[]) {
  const finalState = history[history.length - 1];
  const events = getRuntimeEvents(finalState)
    .filter((event) => event.type === "premature_closure_attempted" && event.prematureClosure?.blocked);

  return events.map((event) => {
    const attemptState = history.find((state) => (state.turn_number ?? 0) === event.atTurn) || finalState;
    const laterStates = history.filter((state) => (state.turn_number ?? 0) > event.atTurn);
    const laterAttempt = laterStates.some((state) => (state.runtime_events || []).some((runtimeEvent) => (
      runtimeEvent.type === "premature_closure_attempted"
      && (runtimeEvent.atTurn ?? 0) > event.atTurn
    )));
    const recovered = laterStates.some((state) => (
      (state.trust_level ?? 0) >= ((attemptState?.trust_level ?? 0) + 2)
      && (
        state.accepted_next_step
        || state.valid_redirect
        || state.terminal_outcome_state === "RESOLVED"
        || state.terminal_outcome_state === "ESCALATED"
      )
    ));
    const recovery = recovered
      ? "The employee recovered later with a more concrete, credible next step."
      : laterAttempt
        ? "The employee doubled down and tried to close early again later in the conversation."
        : "No recovery landed before the conversation ended.";

    return {
      turn: event.atTurn,
      trigger: event.prematureClosure?.trigger_phrase_or_reason || event.summary,
      unresolvedGaps: event.prematureClosure?.unresolved_gaps_snapshot || event.blockedBy || [],
      customerReaction: describeCustomerReaction(attemptState),
      recovery,
    };
  });
}

function buildMissedMoments(history: SimulationStateSnapshot[]) {
  const moments: DebriefMoment[] = [];
  const prematureAttempts = buildPrematureClosureAttempts(history);

  for (const attempt of prematureAttempts) {
    moments.push({
      turn: attempt.turn,
      title: "Premature close",
      detail: `You tried to land the conversation on "${attempt.trigger}" while these gaps were still open: ${attempt.unresolvedGaps.slice(0, 2).join("; ") || "the complaint was still open"}.`,
    });
  }

  for (let index = 0; index < history.length; index++) {
    const state = history[index];
    const analysis = readAnalysis(state);
    const turn = state.turn_number ?? index + 1;

    if (
      state.premature_closure_detected
      && analysis.explicitClosureAttempt
      && !prematureAttempts.some((attempt) => attempt.turn === turn)
    ) {
      moments.push({
        turn,
        title: "Premature close",
        detail: "You tried to wrap up before the customer had a real outcome or accepted next step.",
      });
    }

    if (analysis.vaguenessDetected && !analysis.explicitNextStep && !analysis.explicitTimeline) {
      moments.push({
        turn,
        title: "Vague follow-up",
        detail: "You moved toward follow-up language without naming who would act or when.",
      });
    }

    if (analysis.policyMisuse && !analysis.tookOwnership) {
      moments.push({
        turn,
        title: "Policy without ownership",
        detail: "You referenced policy without pairing it with a useful action or handoff.",
      });
    }

    if (analysis.roboticPhrasing) {
      moments.push({
        turn,
        title: "Scripted delivery",
        detail: "The answer sounded rehearsed instead of grounded, which makes customers less trusting.",
      });
    }

    if (analysis.soundedDismissive || analysis.soundedRude) {
      moments.push({
        turn,
        title: "Tone problem",
        detail: "The customer had a reason to react to your tone, not just the information itself.",
      });
    }
  }

  return moments.slice(0, 5);
}

function buildReplayFocus(finalState: SimulationStateSnapshot, coaching: CoachingNote | null, missedMoments: DebriefMoment[]) {
  return unique([
    ...(coaching?.do_this_next_time || []),
    missedMoments[0]?.detail,
    !finalState.accepted_next_step && !finalState.valid_redirect ? "Practice naming the owner, action, and timeline before you try to close." : null,
    finalState.premature_closure_detected ? "Replay the turn where you tried to close early and replace it with a concrete next step." : null,
  ]).slice(0, 4);
}

export function buildPostCallDebrief(params: {
  stateHistory: SimulationStateSnapshot[];
  evaluation: EvaluationResult | null;
  coaching: CoachingNote | null;
  managerDebrief?: ManagerDebrief | null;
}) : PostCallDebrief {
  const finalState = params.stateHistory[params.stateHistory.length - 1];
  const trustSummary = buildTrustDeltaSummary(params.stateHistory);
  const prematureClosureAttempts = buildPrematureClosureAttempts(params.stateHistory);
  const missedMoments = buildMissedMoments(params.stateHistory);
  const outcomeState = finalState?.terminal_outcome_state || finalState?.issue_progress_state || finalState?.goal_status || "ACTIVE";
  const isActuallyResolved = outcomeState === "RESOLVED";
  const escalationWasValid = outcomeState === "ESCALATED" && Boolean(finalState?.valid_redirect && finalState?.accepted_next_step && (finalState?.unmet_completion_criteria || []).length === 0);
  const hasValidNextStep = Boolean(finalState?.accepted_next_step || finalState?.valid_redirect);
  const polishedButUnresolved = Boolean(
    params.evaluation?.score_dimensions
    && params.evaluation.score_dimensions.interaction_quality >= 70
    && params.evaluation.score_dimensions.outcome_quality <= 55
    && !isActuallyResolved
    && !escalationWasValid,
  );

  return {
    outcomeState,
    isActuallyResolved,
    hasValidNextStep,
    escalationWasValid,
    prematureClosureAttempted: prematureClosureAttempts.length > 0 || Boolean(finalState?.premature_closure_detected),
    prematureClosureAttempts,
    unmetCompletionCriteria: finalState?.unmet_completion_criteria || [],
    unresolvedQuestions: finalState?.unresolved_questions || [],
    outcomeSummary: finalState?.outcome_summary || params.evaluation?.summary || "No outcome summary captured.",
    strongestPositiveBehaviors: unique([
      ...(params.evaluation?.best_moments || []),
      ...(params.coaching?.what_you_did_well || []),
      ...(params.managerDebrief?.top_strengths || []),
    ]).slice(0, 5),
    customerStillNeeded: buildCustomerStillNeeded(finalState || ({} as SimulationStateSnapshot)),
    whyThisDidOrDidNotCountAsComplete: buildCompletionExplanation(finalState || ({} as SimulationStateSnapshot)),
    whereTrustMoved: trustSummary.lines,
    emotionalProgression: buildEmotionSummary(params.stateHistory),
    whatChangedCustomerTone: buildToneChangeSummary(params.stateHistory),
    missedMoments,
    bestRecoveryMoment: trustSummary.largestGain ? `Turn ${trustSummary.largestGain.turn}: ${trustSummary.largestGain.detail}` : null,
    polishedButUnresolved,
    unresolvedTooLong: params.stateHistory.length >= 5 && outcomeState !== "RESOLVED" && outcomeState !== "ESCALATED",
    reliedOnVagueFollowUp: params.stateHistory.some((state) => {
      const analysis = readAnalysis(state);
      return Boolean(analysis.vaguenessDetected && !analysis.explicitNextStep && !analysis.explicitTimeline);
    }),
    policyWithoutOwnership: params.stateHistory.some((state) => {
      const analysis = readAnalysis(state);
      return Boolean(analysis.policyMisuse && !analysis.tookOwnership);
    }),
    recommendedReplayFocus: buildReplayFocus(finalState || ({} as SimulationStateSnapshot), params.coaching, missedMoments),
    interactionVsOutcomeNote: polishedButUnresolved
      ? "You sounded more polished than resolved. The conversation felt calmer than the actual outcome."
      : isActuallyResolved || escalationWasValid
        ? "Your outcome matched the tone of the conversation. The customer left with a concrete path."
        : "The interaction had some useful moments, but the outcome stayed weaker than the conversation tone.",
  };
}
