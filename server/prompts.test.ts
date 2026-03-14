import { describe, expect, it } from "vitest";

import { CUSTOMER_SIMULATOR_SYSTEM, SCENARIO_DIRECTOR_SYSTEM } from "./prompts";
import { buildLiveVoiceInstructions } from "./services/live-voice";
import type { ScenarioDirectorResult } from "./services/ai/contracts";

function createScenario(): ScenarioDirectorResult {
  return {
    scenario_id: "prompt-test-billing",
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
    situation_summary: "A member sees two charges and wants to know what is pending, what is final, and what happens next.",
    opening_line: "I need to know why I was charged twice and what happens next.",
    hidden_facts: ["One charge is pending and one is final."],
    approved_resolution_paths: ["Verify the ledger, explain the charge status, and give a concrete follow-up timeline."],
    required_behaviors: ["Answer directly", "Take ownership", "Give a concrete next step"],
    critical_errors: ["Blame the customer", "Guess at billing policy"],
    branch_logic: {
      if_empathy_is_strong: "Customer is more willing to keep talking.",
      if_answer_is_vague: "Customer becomes more skeptical.",
      if_policy_is_wrong: "Customer asks for a manager.",
      if_employee_takes_ownership: "Customer stays engaged.",
      if_employee_fails_to_help: "Customer pushes harder.",
      if_employee_escalates_correctly: "Customer accepts a handoff.",
    },
    emotion_progression: {
      starting_state: "frustrated",
      better_if: ["Clear answer", "Ownership"],
      worse_if: ["Vague answer", "Deflection"],
    },
    completion_rules: {
      resolved_if: ["Customer understands the charge and the exact next step."],
      end_early_if: ["Employee makes a critical error."],
      manager_required_if: ["Billing exception needs supervisor approval."],
    },
    recommended_turns: 4,
    motive: "Get a believable explanation and leave knowing exactly what happens next.",
    hidden_context: "This customer has had one billing mix-up before and is watching for vague answers.",
    personality_style: "direct and organized",
    past_history: "Previously had to call back twice on a billing issue.",
    pressure_context: "Needs to leave for another appointment soon and does not want to chase this later.",
    friction_points: ["unclear billing language", "vague follow-up promises"],
    emotional_triggers: ["being brushed off", "policy without help"],
    likely_assumptions: ["someone made a mistake", "the club may try to delay fixing it"],
    what_hearing_them_out_sounds_like: ["answering the actual billing question directly", "naming who owns the follow-up", "giving a real timeline"],
    credible_next_steps: ["verify the ledger now", "send the billing correction today", "give a confirmation timeline before ending the conversation"],
    calm_down_if: ["the employee explains the charge clearly", "the employee owns the next step"],
    lose_trust_if: ["the employee repeats vague reassurance", "the employee acts like the issue is already handled when it is not"],
  };
}

describe("prompt layer", () => {
  it("removes turn-count and brevity bias from the main customer prompts", () => {
    expect(SCENARIO_DIRECTOR_SYSTEM).not.toContain("under 5 conversational turns");
    expect(SCENARIO_DIRECTOR_SYSTEM).not.toContain("3-5 turns");
    expect(CUSTOMER_SIMULATOR_SYSTEM).not.toContain("1 to 3 spoken sentences");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("Do not start acting done just because several exchanges have already happened.");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("Do not help the employee reach a tidy ending if the actual issue is still open.");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("a private sense of what you think happened versus what actually happened");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("Am I clearer now, or more confused?");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("most turns should sound said in the moment");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("Do not keep repeating the same opener shape");
    expect(CUSTOMER_SIMULATOR_SYSTEM).toContain("Do not stack multiple neat reassurance sentences");
  });

  it("tells the live voice actor to resist fake closure and preset arcs", () => {
    const instructions = buildLiveVoiceInstructions(createScenario(), "Front Desk Associate");

    expect(instructions).toContain("The call does not have a preset number of turns.");
    expect(instructions).toContain("Do not assume the call is over because the employee sounds calm");
    expect(instructions).toContain("What would make you feel heard:");
    expect(instructions).toContain("What makes you feel brushed off:");
    expect(instructions).toContain("If the employee is vague, polished-but-empty, dismissive, scripted, repetitive, policy-only, or tries to close too early, react like a believable person would for this personality.");
    expect(instructions).toContain("Phone-call rule: most turns should sound like they came out in the moment");
    expect(instructions).toContain("Do not keep leaning on the same opener shape");
    expect(instructions).toContain("Why you called:");
    expect(instructions).not.toContain("Scenario family:");
    expect(instructions).not.toContain("Approved resolution paths:");
    expect(instructions).not.toContain("keep each reply to one natural spoken turn rather than a long monologue");
  });
});
