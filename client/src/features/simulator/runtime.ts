import type {
  ConversationOutcomeState,
  PrematureClosureTriggerSource,
} from "@shared/conversation-outcome";
import {
  appendConversationRuntimeEvent,
  buildPrematureClosureRuntimeEvent,
  evaluateConversationTerminalState,
  getConversationOutcomeState,
} from "@shared/conversation-outcome";
import type { SimulationStateSnapshot } from "./types";

export type FrontendCloseTrigger =
  | "backend_terminal_state"
  | "manual_exit"
  | "transcript_finalized"
  | "closing_phrase"
  | "timeout_failure";

export type LiveRuntimeFailureState = "timeout_failure" | "abandonment_detected" | null;

export type FrontendConversationRuntime = {
  session_active: boolean;
  backend_terminal_state: ConversationOutcomeState;
  terminal_state_validated: boolean;
  complaint_still_open: boolean;
  premature_end_attempt_detected: boolean;
  unresolved_gap_detected: boolean;
  live_runtime_failure_state: LiveRuntimeFailureState;
  terminal_validation_reason: string;
  completion_blockers: string[];
};

export type ManualExitDisposition = {
  accepted_as_terminal: boolean;
  should_append_failure_outcome: boolean;
  reason: string;
  blockedBy: string[];
};

export function deriveConversationRuntimeView(
  latestState?: SimulationStateSnapshot | null,
): FrontendConversationRuntime {
  const validation = evaluateConversationTerminalState(latestState);
  const runtimeEvents = latestState?.runtime_events || [];
  const failureState = runtimeEvents.some((event) => event.type === "timeout_failure")
    ? "timeout_failure"
    : runtimeEvents.some((event) => event.type === "abandonment_detected")
      ? "abandonment_detected"
      : null;
  const unresolvedSubissues = latestState?.unresolved_subissues?.filter(Boolean) || [];
  const unresolvedQuestions = latestState?.unresolved_questions?.filter(Boolean) || [];
  const unmetCriteria = latestState?.unmet_completion_criteria?.filter(Boolean) || [];
  const complaintStillOpen = !validation.isTerminal
    || unresolvedSubissues.length > 0
    || unresolvedQuestions.length > 0
    || unmetCriteria.length > 0;
  const prematureClosureDetected = Boolean(latestState?.premature_closure_detected)
    || runtimeEvents.some((event) => event.type === "premature_closure_attempted");

  return {
    session_active: !validation.isTerminal,
    backend_terminal_state: getConversationOutcomeState(latestState),
    terminal_state_validated: validation.isTerminal,
    complaint_still_open: complaintStillOpen,
    premature_end_attempt_detected: prematureClosureDetected,
    unresolved_gap_detected: validation.blockedBy.length > 0 || unresolvedSubissues.length > 0 || unresolvedQuestions.length > 0,
    live_runtime_failure_state: failureState,
    terminal_validation_reason: validation.terminalReason,
    completion_blockers: validation.blockedBy,
  };
}

export function deriveManualExitDisposition(
  latestState?: SimulationStateSnapshot | null,
): ManualExitDisposition {
  const validation = evaluateConversationTerminalState(latestState);
  if (validation.isTerminal) {
    return {
      accepted_as_terminal: true,
      should_append_failure_outcome: false,
      reason: "Manual exit was allowed because the backend had already validated a terminal state.",
      blockedBy: validation.blockedBy,
    };
  }

  return {
    accepted_as_terminal: false,
    should_append_failure_outcome: true,
    reason: "Manual exit was converted into an explicit abandonment outcome because the complaint was still open.",
    blockedBy: validation.blockedBy,
  };
}

export function appendBlockedPrematureClosureToState(
  latestState: SimulationStateSnapshot | null | undefined,
  params: {
    source: "client" | "live_runtime";
    triggerSource: PrematureClosureTriggerSource;
    triggerPhraseOrReason: string;
    summary?: string;
  },
): SimulationStateSnapshot | null {
  if (!latestState) return null;
  const validation = evaluateConversationTerminalState(latestState);
  if (validation.isTerminal || latestState.complaint_still_open === false) {
    return latestState;
  }

  const nextState: SimulationStateSnapshot = {
    ...latestState,
    premature_closure_detected: true,
  };
  nextState.runtime_events = appendConversationRuntimeEvent(
    nextState,
    buildPrematureClosureRuntimeEvent({
      state: nextState,
      source: params.source,
      triggerSource: params.triggerSource,
      triggerPhraseOrReason: params.triggerPhraseOrReason,
      summary: params.summary,
      blocked: true,
      extra: { atTurn: latestState.turn_number },
    }),
  );
  return nextState;
}

const CLOSING_LANGUAGE_PATTERNS = [
  /\byou(?:'| a)?re all set\b/i,
  /\bwe(?:'| a)?re all set\b/i,
  /\bthat should take care of it\b/i,
  /\bthanks(?:,\s*|\s+)bye\b/i,
  /\bokay(?:,\s*|\s+)bye\b/i,
  /\bbye now\b/i,
  /\bhave a nice day\b/i,
  /\bthat(?:'| i)s everything\b/i,
  /\bnothing else\b/i,
  /\bwe can wrap up\b/i,
];

export function looksLikeClosingLanguage(message?: string | null) {
  if (!message) return false;
  return CLOSING_LANGUAGE_PATTERNS.some((pattern) => pattern.test(message));
}
