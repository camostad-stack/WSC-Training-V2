import { describe, expect, it } from "vitest";
import { evaluateConversationTerminalState } from "@shared/conversation-outcome";
import {
  appendBlockedPrematureClosureToState,
  deriveManualExitDisposition,
  deriveConversationRuntimeView,
  looksLikeClosingLanguage,
} from "./runtime";

describe("deriveConversationRuntimeView", () => {
  it("keeps the session active when the complaint is unresolved even if there is a next step", () => {
    const runtime = deriveConversationRuntimeView({
      turn_number: 4,
      emotion_state: "guarded",
      trust_level: 4,
      issue_clarity: 5,
      terminal_outcome_state: "PARTIALLY_RESOLVED",
      accepted_next_step: true,
      valid_redirect: false,
      unresolved_questions: ["Who exactly is following up with me?"],
      unmet_completion_criteria: ["customer acknowledged next step or escalation"],
    });

    expect(runtime.session_active).toBe(true);
    expect(runtime.terminal_state_validated).toBe(false);
    expect(runtime.complaint_still_open).toBe(true);
    expect(runtime.unresolved_gap_detected).toBe(true);
    expect(runtime.completion_blockers).toContain("partially_resolved_is_not_terminal");
  });

  it("keeps the session active when the customer sounds calm but blockers remain", () => {
    const runtime = deriveConversationRuntimeView({
      turn_number: 5,
      emotion_state: "reassured",
      trust_level: 7,
      issue_clarity: 7,
      terminal_outcome_state: "ACTIVE",
      accepted_next_step: false,
      valid_redirect: false,
      unresolved_subissues: ["refund path still unclear"],
      unmet_completion_criteria: ["employee gave ownership or redirect"],
    });

    expect(runtime.session_active).toBe(true);
    expect(runtime.backend_terminal_state).toBe("ACTIVE");
    expect(runtime.complaint_still_open).toBe(true);
  });

  it("treats a validated resolution as terminal", () => {
    const runtime = deriveConversationRuntimeView({
      turn_number: 6,
      emotion_state: "calm",
      trust_level: 8,
      issue_clarity: 8,
      terminal_outcome_state: "RESOLVED",
      root_issue_status: "RESOLVED",
      unresolved_subissues: [],
      unmet_completion_criteria: [],
    });

    expect(runtime.session_active).toBe(false);
    expect(runtime.terminal_state_validated).toBe(true);
    expect(runtime.backend_terminal_state).toBe("RESOLVED");
    expect(runtime.complaint_still_open).toBe(false);
  });

  it("treats a validated escalation as terminal only when the handoff is concrete", () => {
    const runtime = deriveConversationRuntimeView({
      turn_number: 5,
      emotion_state: "guarded",
      trust_level: 5,
      issue_clarity: 6,
      terminal_outcome_state: "ESCALATED",
      valid_redirect: true,
      accepted_next_step: true,
      next_step_owner: "manager on duty",
      next_step_action: "take over the complaint",
      next_step_timeline: "within five minutes",
      escalation_validity: "valid",
      unmet_completion_criteria: [],
    });

    expect(runtime.session_active).toBe(false);
    expect(runtime.terminal_state_validated).toBe(true);
    expect(runtime.backend_terminal_state).toBe("ESCALATED");
  });

  it("uses the same shared validator outcome as the backend for completion state", () => {
    const state = {
      turn_number: 5,
      emotion_state: "guarded",
      trust_level: 5,
      issue_clarity: 6,
      terminal_outcome_state: "ESCALATED",
      valid_redirect: true,
      accepted_next_step: true,
      next_step_owner: "manager on duty",
      next_step_action: "take over the duplicate-charge review",
      next_step_timeline: "within ten minutes",
      escalation_validity: "valid",
      unmet_completion_criteria: [],
    };

    const validation = evaluateConversationTerminalState(state);
    const runtime = deriveConversationRuntimeView(state);

    expect(runtime.terminal_state_validated).toBe(validation.isTerminal);
    expect(runtime.backend_terminal_state).toBe(validation.outcome);
    expect(runtime.completion_blockers).toEqual(validation.blockedBy);
    expect(runtime.terminal_validation_reason).toBe(validation.terminalReason);
  });

  it("surfaces explicit timeout failures without treating them as successful resolution", () => {
    const runtime = deriveConversationRuntimeView({
      turn_number: 7,
      emotion_state: "frustrated",
      trust_level: 2,
      issue_clarity: 3,
      terminal_outcome_state: "TIMED_OUT",
      unmet_completion_criteria: ["no clear next step"],
      runtime_events: [
        {
          type: "timeout_failure",
          source: "live_runtime",
          atTurn: 7,
          summary: "Live conversation timed out after inactivity before a valid terminal state was reached.",
        },
      ],
    });

    expect(runtime.session_active).toBe(false);
    expect(runtime.terminal_state_validated).toBe(true);
    expect(runtime.live_runtime_failure_state).toBe("timeout_failure");
    expect(runtime.backend_terminal_state).toBe("TIMED_OUT");
  });

  it("records a blocked premature-close event without ending the session", () => {
    const patched = appendBlockedPrematureClosureToState({
      turn_number: 4,
      emotion_state: "guarded",
      trust_level: 4,
      issue_clarity: 5,
      terminal_outcome_state: "ACTIVE",
      complaint_still_open: true,
      unresolved_questions: ["Who is actually following up with me?"],
      unmet_completion_criteria: ["customer acknowledged next step or escalation"],
      runtime_events: [],
    }, {
      source: "live_runtime",
      triggerSource: "customer_reply_pattern",
      triggerPhraseOrReason: "Okay, thanks.",
      summary: "Customer wrap-up language was rejected because the complaint was still open.",
    });

    expect(patched?.premature_closure_detected).toBe(true);
    expect(patched?.runtime_events?.[0]?.type).toBe("premature_closure_attempted");
    expect(patched?.runtime_events?.[0]?.prematureClosure?.blocked).toBe(true);
    expect(patched?.runtime_events?.[0]?.prematureClosure?.trigger_source).toBe("customer_reply_pattern");
  });

  it("keeps manual exit distinct from successful completion", () => {
    const unresolved = deriveManualExitDisposition({
      turn_number: 4,
      emotion_state: "guarded",
      trust_level: 4,
      issue_clarity: 5,
      terminal_outcome_state: "ACTIVE",
      complaint_still_open: true,
      unmet_completion_criteria: ["real next step still missing"],
      unresolved_subissues: ["refund path still unclear"],
    });
    const resolved = deriveManualExitDisposition({
      turn_number: 6,
      emotion_state: "calm",
      trust_level: 8,
      issue_clarity: 9,
      terminal_outcome_state: "RESOLVED",
      root_issue_status: "RESOLVED",
      unmet_completion_criteria: [],
      unresolved_subissues: [],
    });

    expect(unresolved.accepted_as_terminal).toBe(false);
    expect(unresolved.should_append_failure_outcome).toBe(true);
    expect(unresolved.reason).toContain("explicit abandonment outcome");

    expect(resolved.accepted_as_terminal).toBe(true);
    expect(resolved.should_append_failure_outcome).toBe(false);
    expect(resolved.reason).toContain("backend had already validated a terminal state");
  });
});

describe("looksLikeClosingLanguage", () => {
  it("detects common wrap-up phrases without treating them as completion by itself", () => {
    expect(looksLikeClosingLanguage("Okay, you're all set.")).toBe(true);
    expect(looksLikeClosingLanguage("Thanks, bye.")).toBe(true);
    expect(looksLikeClosingLanguage("I am checking that now.")).toBe(false);
  });
});
