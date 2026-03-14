export type ConversationOutcomeState =
  | "ACTIVE"
  | "PARTIALLY_RESOLVED"
  | "RESOLVED"
  | "ESCALATED"
  | "ABANDONED"
  | "TIMED_OUT";

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

export type PrematureClosureEvent = {
  trigger_source: PrematureClosureTriggerSource;
  trigger_phrase_or_reason: string;
  complaint_still_open: boolean;
  unresolved_gaps_snapshot: string[];
  trust_level_at_attempt: number | null;
  emotional_state_at_attempt: string | null;
  blocked: boolean;
  customer_strategy_at_attempt?: string | null;
  likely_next_behavior_at_attempt?: string | null;
};

export type ConversationRuntimeEvent = {
  type: ConversationRuntimeEventType;
  source: "state_manager" | "client" | "live_runtime" | "persistence";
  atTurn: number;
  summary: string;
  outcomeState?: ConversationOutcomeState;
  unmetCriteria?: string[];
  blockedBy?: string[];
  prematureClosure?: PrematureClosureEvent;
};

export type ConversationOutcomeLike = {
  goal_status?: string | null;
  outcome_state?: string | null;
  terminal_outcome_state?: string | null;
  emotion_state?: string | null;
  emotional_state?: string | null;
  trust_level?: number | null;
  complaint_status?: string | null;
  complaint_still_open?: boolean | null;
  root_issue_status?: string | null;
  accepted_next_step?: boolean | null;
  valid_redirect?: boolean | null;
  escalation_validity?: string | null;
  next_step_owner?: string | null;
  next_step_action?: string | null;
  next_step_timeline?: string | null;
  next_step_missing_fields?: string[] | null;
  subissues_open?: string[] | null;
  unresolved_customer_questions?: string[] | null;
  unresolved_subissues?: string[] | null;
  unmet_completion_criteria?: string[] | null;
  turn_number?: number | null;
  customer_strategy?: string | null;
  likely_next_behavior?: string | null;
  runtime_events?: ConversationRuntimeEvent[] | null;
  terminal_validation_reason?: string | null;
  completion_blockers?: string[] | null;
};

export const TERMINAL_CONVERSATION_OUTCOMES: ConversationOutcomeState[] = [
  "RESOLVED",
  "ESCALATED",
  "ABANDONED",
  "TIMED_OUT",
];

export type ConversationTerminalValidation = {
  outcome: ConversationOutcomeState;
  isTerminal: boolean;
  terminalEventType: ConversationRuntimeEventType | null;
  terminalReason: string;
  blockedBy: string[];
  unmetCriteria: string[];
};

function hasConcreteNextStep(state: ConversationOutcomeLike | null | undefined) {
  return Boolean(
    state?.next_step_owner?.trim()
    && state?.next_step_action?.trim()
    && state?.next_step_timeline?.trim(),
  );
}

function hasMateriallyUnresolvedComplaint(state: ConversationOutcomeLike | null | undefined) {
  if (typeof state?.complaint_still_open === "boolean") {
    return state.complaint_still_open;
  }
  if ((state?.subissues_open || []).filter(Boolean).length > 0) {
    return true;
  }
  return (state?.unresolved_subissues || []).filter(Boolean).length > 0;
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function buildUnresolvedGapSnapshot(state: ConversationOutcomeLike | null | undefined) {
  return dedupeStrings([
    ...(state?.unresolved_customer_questions || []),
    ...(state?.unresolved_subissues || []),
    ...(state?.subissues_open || []),
    ...(state?.unmet_completion_criteria || []),
    ...((state?.next_step_missing_fields || []).map((field) => `next step missing ${field}`)),
    state?.accepted_next_step === false ? "next step not accepted" : null,
    state?.valid_redirect === false && getConversationOutcomeState(state) === "ESCALATED" ? "redirect is not yet valid" : null,
  ]).slice(0, 8);
}

export function getConversationOutcomeState(state: ConversationOutcomeLike | null | undefined): ConversationOutcomeState {
  const terminalOutcome = state?.terminal_outcome_state;
  const rawState = (
    terminalOutcome && terminalOutcome !== "ACTIVE"
      ? terminalOutcome
      : state?.goal_status || state?.outcome_state || terminalOutcome || "ACTIVE"
  );
  switch (rawState) {
    case "PARTIALLY_RESOLVED":
    case "RESOLVED":
    case "ESCALATED":
    case "ABANDONED":
    case "TIMED_OUT":
      return rawState;
    default:
      return "ACTIVE";
  }
}

export function evaluateConversationTerminalState(
  state: ConversationOutcomeLike | null | undefined,
): ConversationTerminalValidation {
  const outcome = getConversationOutcomeState(state);
  const unmetCriteria = (state?.unmet_completion_criteria || []).filter(Boolean);
  const blockedBy: string[] = [];
  const rootIssueStatus = (state?.root_issue_status || "").toUpperCase();
  const escalationValidity = (state?.escalation_validity || "").toLowerCase();
  const hasNextStep = hasConcreteNextStep(state);
  const hasUnresolvedComplaint = hasMateriallyUnresolvedComplaint(state);
  const nextStepMissingFields = (state?.next_step_missing_fields || []).filter(Boolean);

  if (outcome === "RESOLVED") {
    if (unmetCriteria.length > 0) {
      blockedBy.push(...unmetCriteria);
    }
    if (hasUnresolvedComplaint) {
      blockedBy.push("unresolved_complaint_persists");
    }
    if (nextStepMissingFields.length > 0 && state?.accepted_next_step) {
      blockedBy.push(...nextStepMissingFields.map((field) => `next_step_${field}_missing`));
    }
    if (rootIssueStatus && rootIssueStatus !== "RESOLVED") {
      blockedBy.push("root_issue_not_resolved");
    }
    if (blockedBy.length > 0) {
      return {
        outcome,
        isTerminal: false,
        terminalEventType: null,
        terminalReason: "Resolution is blocked because the complaint is still materially unresolved.",
        blockedBy,
        unmetCriteria,
      };
    }
    return {
      outcome,
      isTerminal: true,
      terminalEventType: "complaint_fully_resolved",
      terminalReason: "Conversation reached a validated resolution.",
      blockedBy,
      unmetCriteria,
    };
  }

  if (outcome === "ESCALATED") {
    if (state?.valid_redirect !== true) {
      blockedBy.push("valid_redirect_missing");
    }
    if (state?.accepted_next_step !== true) {
      blockedBy.push("accepted_next_step_missing");
    }
    if (!hasNextStep) {
      blockedBy.push("concrete_next_step_missing");
    }
    if (nextStepMissingFields.length > 0) {
      blockedBy.push(...nextStepMissingFields.map((field) => `next_step_${field}_missing`));
    }
    if (escalationValidity !== "valid") {
      blockedBy.push("escalation_not_validated");
    }
    if (unmetCriteria.length > 0) {
      blockedBy.push(...unmetCriteria);
    }

    if (blockedBy.length > 0) {
      return {
        outcome,
        isTerminal: false,
        terminalEventType: null,
        terminalReason: "Escalation is not terminal until the redirect is valid, concrete, and accepted.",
        blockedBy,
        unmetCriteria,
      };
    }

    return {
      outcome,
      isTerminal: true,
      terminalEventType: "escalation_accepted",
      terminalReason: "Conversation reached a validated escalation handoff.",
      blockedBy,
      unmetCriteria,
    };
  }

  if (outcome === "ABANDONED") {
    return {
      outcome,
      isTerminal: true,
      terminalEventType: "abandonment_detected",
      terminalReason: "Conversation ended in explicit failure or abandonment.",
      blockedBy,
      unmetCriteria,
    };
  }

  if (outcome === "TIMED_OUT") {
    return {
      outcome,
      isTerminal: true,
      terminalEventType: "timeout_failure",
      terminalReason: "Conversation ended in an unresolved timeout.",
      blockedBy,
      unmetCriteria,
    };
  }

  if (outcome === "PARTIALLY_RESOLVED") {
    blockedBy.push("partially_resolved_is_not_terminal");
  } else {
    blockedBy.push("conversation_still_active");
  }

  if (unmetCriteria.length > 0) {
    blockedBy.push(...unmetCriteria);
  }

  return {
    outcome,
    isTerminal: false,
    terminalEventType: null,
    terminalReason: "Conversation is still active and cannot end yet.",
    blockedBy,
    unmetCriteria,
  };
}

export function isTerminalConversationState(state: ConversationOutcomeLike | null | undefined): boolean {
  return evaluateConversationTerminalState(state).isTerminal;
}

export function appendConversationRuntimeEvent<T extends ConversationOutcomeLike>(
  state: T,
  event: ConversationRuntimeEvent,
): ConversationRuntimeEvent[] {
  const current = state.runtime_events || [];
  const duplicate = current.some((existing) => (
    existing.type === event.type
    && existing.atTurn === event.atTurn
    && existing.summary === event.summary
  ));
  if (duplicate) return current.slice();
  return [...current, event];
}

export function buildRuntimeEvent(
  type: ConversationRuntimeEventType,
  state: ConversationOutcomeLike | null | undefined,
  source: ConversationRuntimeEvent["source"],
  summary: string,
  extra?: Partial<ConversationRuntimeEvent>,
): ConversationRuntimeEvent {
  const validation = evaluateConversationTerminalState(state);
  return {
    type,
    source,
    atTurn: Number(state?.turn_number || 0),
    summary,
    outcomeState: validation.outcome,
    unmetCriteria: validation.unmetCriteria,
    blockedBy: validation.blockedBy,
    ...extra,
  };
}

export function buildPrematureClosureRuntimeEvent(params: {
  state: ConversationOutcomeLike | null | undefined;
  source: ConversationRuntimeEvent["source"];
  triggerSource: PrematureClosureTriggerSource;
  triggerPhraseOrReason: string;
  summary?: string;
  blocked?: boolean;
  extra?: Partial<ConversationRuntimeEvent>;
}) {
  const validation = evaluateConversationTerminalState(params.state);
  const complaintStillOpen = typeof params.state?.complaint_still_open === "boolean"
    ? params.state.complaint_still_open
    : !validation.isTerminal;
  const unresolvedSnapshot = buildUnresolvedGapSnapshot(params.state);
  const blocked = params.blocked ?? (complaintStillOpen && !validation.isTerminal);
  const summary = params.summary
    || (
      blocked
        ? `Premature closure was blocked while unresolved gaps remained: ${unresolvedSnapshot.slice(0, 3).join(", ") || "complaint still open"}.`
        : "A closure attempt occurred after the issue had already reached a valid terminal state."
    );

  return buildRuntimeEvent(
    "premature_closure_attempted",
    params.state,
    params.source,
    summary,
    {
      prematureClosure: {
        trigger_source: params.triggerSource,
        trigger_phrase_or_reason: params.triggerPhraseOrReason.trim(),
        complaint_still_open: complaintStillOpen,
        unresolved_gaps_snapshot: unresolvedSnapshot,
        trust_level_at_attempt: typeof params.state?.trust_level === "number" ? params.state.trust_level : null,
        emotional_state_at_attempt: (params.state?.emotional_state || params.state?.emotion_state || null) as string | null,
        blocked,
        customer_strategy_at_attempt: (params.state as { customer_strategy?: string | null } | null | undefined)?.customer_strategy ?? null,
        likely_next_behavior_at_attempt: (params.state as { likely_next_behavior?: string | null } | null | undefined)?.likely_next_behavior ?? null,
      },
      ...params.extra,
    },
  );
}

export function buildExplicitFailureOutcomePatch(
  summary: string,
  unmetCompletionCriteria: string[] = [],
  eventType: ConversationRuntimeEventType = "abandonment_detected",
) {
  const timedOut = eventType === "timeout_failure";
  const failureOutcome = timedOut ? "TIMED_OUT" : "ABANDONED";
  const complaintStatus = timedOut ? "OPEN" : "ABANDONED";
  const rootIssueStatus = timedOut ? "UNRESOLVED" : "ABANDONED";
  const failureState = {
    goal_status: failureOutcome,
    issue_progress_state: failureOutcome,
    terminal_outcome_state: failureOutcome,
    continue_simulation: false,
    accepted_next_step: false,
    valid_redirect: false,
    escalation_validity: "invalid" as const,
    complaint_status: complaintStatus,
    complaint_still_open: timedOut,
    root_issue_status: rootIssueStatus,
    subissues_open: unmetCompletionCriteria,
    unresolved_subissues: unmetCompletionCriteria,
    next_step_action: "",
    next_step_missing_fields: [],
    premature_closure_detected: eventType === "premature_closure_attempted",
    unmet_completion_criteria: unmetCompletionCriteria,
    unresolved_customer_questions: unmetCompletionCriteria,
    outcome_summary: summary,
  };
  const validation = evaluateConversationTerminalState(failureState);
  return {
    ...failureState,
    terminal_validation_reason: validation.terminalReason,
    completion_blockers: validation.blockedBy,
    runtime_events: [
      {
        type: eventType,
        source: "client" as const,
        atTurn: 0,
        summary,
        outcomeState: validation.outcome,
        unmetCriteria: validation.unmetCriteria,
        blockedBy: validation.blockedBy,
      },
    ],
  };
}
