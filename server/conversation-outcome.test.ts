import { describe, expect, it } from "vitest";
import {
  buildPrematureClosureRuntimeEvent,
  buildExplicitFailureOutcomePatch,
  evaluateConversationTerminalState,
  isTerminalConversationState,
} from "../shared/conversation-outcome";

describe("conversation terminal validator", () => {
  it("does not allow partially resolved conversations to end", () => {
    const state = {
      goal_status: "PARTIALLY_RESOLVED",
      terminal_outcome_state: "PARTIALLY_RESOLVED",
      accepted_next_step: true,
      valid_redirect: false,
      unmet_completion_criteria: ["customer still needs a concrete owner and timeline"],
    } as const;

    const validation = evaluateConversationTerminalState(state);
    expect(validation.isTerminal).toBe(false);
    expect(validation.blockedBy).toContain("partially_resolved_is_not_terminal");
    expect(isTerminalConversationState(state)).toBe(false);
  });

  it("blocks escalation without a concrete accepted redirect", () => {
    const state = {
      goal_status: "ESCALATED",
      terminal_outcome_state: "ESCALATED",
      accepted_next_step: false,
      valid_redirect: false,
      escalation_validity: "potential",
      next_step_owner: "",
      next_step_action: "",
      next_step_timeline: "",
      unmet_completion_criteria: [],
    } as const;

    const validation = evaluateConversationTerminalState(state);
    expect(validation.isTerminal).toBe(false);
    expect(validation.blockedBy).toContain("valid_redirect_missing");
    expect(validation.blockedBy).toContain("accepted_next_step_missing");
  });

  it("allows validated escalation to end", () => {
    const state = {
      goal_status: "ESCALATED",
      terminal_outcome_state: "ESCALATED",
      accepted_next_step: true,
      valid_redirect: true,
      escalation_validity: "valid",
      next_step_owner: "manager",
      next_step_action: "take over the billing exception review",
      next_step_timeline: "within 10 minutes",
      unmet_completion_criteria: [],
    } as const;

    const validation = evaluateConversationTerminalState(state);
    expect(validation.isTerminal).toBe(true);
    expect(validation.terminalEventType).toBe("escalation_accepted");
  });

  it("treats timeout failures as explicit terminal failures", () => {
    const patch = buildExplicitFailureOutcomePatch(
      "Conversation timed out before the issue was resolved.",
      ["customer still needs a concrete next step"],
      "timeout_failure",
    );

    const validation = evaluateConversationTerminalState(patch);
    expect(validation.isTerminal).toBe(true);
    expect(validation.outcome).toBe("TIMED_OUT");
    expect(patch.runtime_events[0]?.type).toBe("timeout_failure");
  });

  it("does not allow resolved outcome when complaint subissues still remain", () => {
    const state = {
      goal_status: "RESOLVED",
      terminal_outcome_state: "RESOLVED",
      root_issue_status: "PARTIALLY_ADDRESSED",
      unresolved_subissues: ["customer still does not know who will follow up"],
      accepted_next_step: true,
      unmet_completion_criteria: [],
    } as const;

    const validation = evaluateConversationTerminalState(state);
    expect(validation.isTerminal).toBe(false);
    expect(validation.blockedBy).toContain("unresolved_complaint_persists");
    expect(validation.blockedBy).toContain("root_issue_not_resolved");
  });

  it("builds a structured premature-closure event with unresolved gap context", () => {
    const event = buildPrematureClosureRuntimeEvent({
      state: {
        turn_number: 3,
        terminal_outcome_state: "ACTIVE",
        complaint_still_open: true,
        trust_level: 3,
        emotional_state: "frustrated",
        unresolved_customer_questions: ["Who is actually following up with me?"],
        next_step_missing_fields: ["timeline"],
        unmet_completion_criteria: ["customer acknowledged next step or escalation"],
        customer_strategy: "press_for_specifics",
        likely_next_behavior: "ask_follow_up",
      },
      source: "state_manager",
      triggerSource: "employee_wrap_up_language",
      triggerPhraseOrReason: "You should be all set now.",
    });

    expect(event.type).toBe("premature_closure_attempted");
    expect(event.prematureClosure?.blocked).toBe(true);
    expect(event.prematureClosure?.trigger_source).toBe("employee_wrap_up_language");
    expect(event.prematureClosure?.unresolved_gaps_snapshot).toContain("Who is actually following up with me?");
    expect(event.prematureClosure?.unresolved_gaps_snapshot).toContain("next step missing timeline");
  });
});
