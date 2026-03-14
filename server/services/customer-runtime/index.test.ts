import { describe, expect, it } from "vitest";
import { processConversationRuntimeTurn } from ".";
import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return {
    scenario_id: "live-runtime-billing",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Long-time member who watches billing closely",
      communication_style: "direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees two membership-related charges and wants a direct explanation.",
    opening_line: "I need to know why I was charged twice and what you're doing about it.",
    hidden_facts: ["One charge is pending and one is final."],
    approved_resolution_paths: ["Verify the ledger and explain the next step clearly."],
    required_behaviors: ["Show empathy", "Take ownership", "Give a direct next step"],
    critical_errors: ["Blame the member", "Guess at billing policy"],
    branch_logic: {
      if_empathy_is_strong: "Customer becomes easier to help.",
      if_answer_is_vague: "Customer gets more skeptical.",
      if_policy_is_wrong: "Customer asks for a manager.",
      if_employee_takes_ownership: "Customer stays engaged.",
      if_employee_fails_to_help: "Customer escalates frustration.",
      if_employee_escalates_correctly: "Customer accepts a handoff.",
    },
    emotion_progression: {
      starting_state: "frustrated",
      better_if: ["Clear answer", "Ownership"],
      worse_if: ["Vague answer", "Deflection"],
    },
    completion_rules: {
      resolved_if: ["Customer understands the charge and next step."],
      end_early_if: ["Employee makes a critical error."],
      manager_required_if: ["Billing exception needs supervisor approval."],
    },
    recommended_turns: 4,
    ...overrides,
  };
}

describe("customer runtime live turn orchestration", () => {
  it("keeps the complaint open and returns realtime instructions after a vague employee turn", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "I need to know why I was charged twice and what you're doing about it." },
      { role: "employee", message: "I understand. We will look into it and get back to you." },
    ];

    const result = processConversationRuntimeTurn({
      scenario: createScenario(),
      transcript,
      employeeResponse: "I understand. We will look into it and get back to you.",
      sessionSeed: "live-session-one",
      preferredVoiceProvider: "openai-realtime-native",
    });

    expect(result.stateUpdate.complaint_still_open).toBe(true);
    expect(result.terminalValidation.isTerminal).toBe(false);
    expect(result.realtimeResponseInstructions).toContain("What still feels unresolved");
    expect(result.realtimeResponseInstructions).toContain("Do not wind down");
    expect(result.realtimeResponseInstructions).toContain("Do not infer that the call is over from a polite goodbye");
    expect(result.realtimeResponseInstructions).toContain("Make it sound like phone speech, not a written paragraph.");
    expect(result.realtimeResponseInstructions).toContain("Recent opening shapes to avoid repeating unless repetition is intentional:");
    expect(result.voiceCast.provider).toBe("openai-realtime-native");
  });

  it("can swap the speech provider to Cartesia without changing complaint-state behavior", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "I need to know why I was charged twice and what you're doing about it." },
      { role: "employee", message: "We are looking into that for you." },
    ];

    const result = processConversationRuntimeTurn({
      scenario: createScenario(),
      transcript,
      employeeResponse: "We are looking into that for you.",
      sessionSeed: "live-session-cartesia",
      preferredVoiceProvider: "cartesia",
    });

    expect(result.voiceCast.provider).toBe("cartesia");
    expect(result.stateUpdate.complaint_still_open).toBe(true);
    expect(result.terminalValidation.isTerminal).toBe(false);
    expect(result.realtimeResponseInstructions).toContain("What still feels unresolved");
  });

  it("keeps the same voice cast across turns when the live session is already locked", () => {
    const firstTurn = processConversationRuntimeTurn({
      scenario: createScenario(),
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice and what you're doing about it." },
      ],
      employeeResponse: "I am looking at the account now.",
      sessionSeed: "locked-live-session",
      preferredVoiceProvider: "cartesia",
    });

    const secondTurn = processConversationRuntimeTurn({
      scenario: createScenario(),
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice and what you're doing about it." },
        { role: "employee", message: "I am looking at the account now." },
        { role: "customer", message: firstTurn.customerReply.customer_reply },
      ],
      employeeResponse: "I still need another minute to verify it.",
      priorState: firstTurn.stateUpdate,
      sessionSeed: "locked-live-session",
      preferredVoiceProvider: "openai-native-speech",
      lockedVoiceCast: firstTurn.voiceCast,
    });

    expect(secondTurn.voiceCast.provider).toBe(firstTurn.voiceCast.provider);
    expect(secondTurn.voiceCast.voiceId).toBe(firstTurn.voiceCast.voiceId);
    expect(secondTurn.realtimeResponseInstructions).toContain(`voice=${firstTurn.voiceCast.voiceId}`);
  });

  it("keeps the complaint open across a longer vague back-and-forth", () => {
    const scenario = createScenario();
    let state: any = undefined;
    let transcript: TranscriptTurn[] = [
      { role: "customer", message: scenario.opening_line },
    ];

    const vagueEmployeeTurns = [
      "I hear you. Someone will look into it.",
      "We are still checking on that for you.",
      "It should get sorted out soon.",
      "You should be all set once the team reviews it.",
    ];

    let lastResult: ReturnType<typeof processConversationRuntimeTurn> | null = null;

    for (const employeeResponse of vagueEmployeeTurns) {
      transcript = [...transcript, { role: "employee", message: employeeResponse }];
      lastResult = processConversationRuntimeTurn({
        scenario,
        transcript,
        employeeResponse,
        priorState: state,
        sessionSeed: "live-session-vague-loop",
        preferredVoiceProvider: "openai-realtime-native",
      });
      state = lastResult.stateUpdate;
      transcript = [...transcript, { role: "customer", message: lastResult.customerReply.customer_reply }];
    }

    expect(lastResult).not.toBeNull();
    expect(lastResult?.stateUpdate.complaint_still_open).toBe(true);
    expect(lastResult?.terminalValidation.isTerminal).toBe(false);
    expect(lastResult?.stateUpdate.runtime_events.some((event) => event.type === "premature_closure_attempted")).toBe(true);
  });

  it("allows a valid concrete resolution to become terminal while keeping the actor human", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "I need to know why I was charged twice and what you're doing about it." },
      { role: "employee", message: "I am checking the ledger now." },
      { role: "customer", message: "Okay, but what exactly happens next?", emotion: "skeptical" },
    ];

    const result = processConversationRuntimeTurn({
      scenario: createScenario(),
      transcript,
      employeeResponse: "The final charge is your active membership, the other one is still pending, and I am sending the correction now. I own it, and you will have confirmation this afternoon.",
      sessionSeed: "live-session-two",
      preferredVoiceProvider: "openai-realtime-native",
    });

    expect(result.stateUpdate.terminal_outcome_state).toBe("RESOLVED");
    expect(result.terminalValidation.isTerminal).toBe(true);
    expect(result.realtimeResponseInstructions).toContain("The issue has reached a valid ending");
  });

  it("allows a valid escalation with owner, action, and timeline to end the call", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "I need to know why I was charged twice and what you're doing about it." },
      { role: "employee", message: "I am checking the ledger now." },
      { role: "customer", message: "If you cannot fix it, who exactly is taking this over?", emotion: "skeptical" },
    ];

    const result = processConversationRuntimeTurn({
      scenario: createScenario(),
      transcript,
      employeeResponse: "Our billing manager Dana is taking over the duplicate-charge review, I am handing it to her right now, and she will call you back within ten minutes.",
      sessionSeed: "live-session-escalation",
      preferredVoiceProvider: "openai-realtime-native",
    });

    expect(result.stateUpdate.terminal_outcome_state).toBe("ESCALATED");
    expect(result.terminalValidation.isTerminal).toBe(true);
    expect(result.stateUpdate.next_step_owner.toLowerCase()).toContain("manager");
    expect(result.stateUpdate.next_step_action.length).toBeGreaterThan(0);
    expect(result.stateUpdate.next_step_timeline.length).toBeGreaterThan(0);
  });
});
