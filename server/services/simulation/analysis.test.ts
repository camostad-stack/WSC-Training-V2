import { describe, expect, it } from "vitest";
import { analyzeEmployeeUtterance, ANALYZER_REACTION_THRESHOLDS, buildUtteranceAnalysisPromptPayload, mergeLlmAssistedAnalysis } from "./analysis";
import type { ScenarioDirectorResult } from "../ai/contracts";

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return {
    scenario_id: "seed-billing-confusion-3",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Long-time member who expects clarity and follow-through.",
      communication_style: "direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees two membership-related charges and wants a clear answer.",
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

describe("employee utterance analyzer", () => {
  it("scores a strong front-desk answer as clear, respectful, and useful", () => {
    const analysis = analyzeEmployeeUtterance(
      "I can see why that would be frustrating. I am pulling up your ledger now to verify which charge is pending and which one is final, and I will give you the correction before you leave.",
      createScenario(),
      { latestCustomerMessage: "I need to know why I was charged twice." },
    );

    expect(analysis.clarity).toBeGreaterThanOrEqual(7);
    expect(analysis.empathy).toBeGreaterThanOrEqual(6);
    expect(analysis.tookOwnership).toBe(true);
    expect(analysis.setExpectationsClearly).toBe(true);
    expect(analysis.madeCustomerFeelHeard).toBe(true);
    expect(analysis.avoidedQuestion).toBe(false);
  });

  it("treats an average answer as polite but still vague", () => {
    const analysis = analyzeEmployeeUtterance(
      "I understand. We will look into it and get back to you.",
      createScenario(),
      { latestCustomerMessage: "What are you doing about this?" },
    );

    expect(analysis.politeness).toBeGreaterThanOrEqual(5);
    expect(analysis.vaguenessDetected).toBe(true);
    expect(analysis.answeredQuestion).toBe(false);
    expect(analysis.avoidedQuestion).toBe(true);
    expect(analysis.setExpectationsClearly).toBe(false);
  });

  it("detects weak answers that deflect and dead-end the conversation", () => {
    const analysis = analyzeEmployeeUtterance(
      "I don't know. You'll need to talk to someone else.",
      createScenario(),
      { latestCustomerMessage: "Can you fix this today?" },
    );

    expect(analysis.deadEndLanguage).toBe(true);
    expect(analysis.tookOwnership).toBe(false);
    expect(analysis.helpfulness).toBeLessThanOrEqual(3);
    expect(analysis.avoidedQuestion).toBe(true);
  });

  it("detects bad answers that are rude, blaming, and disrespectful", () => {
    const analysis = analyzeEmployeeUtterance(
      "Calm down. That's your fault, not ours.",
      createScenario(),
      { latestCustomerMessage: "Why did this happen?" },
    );

    expect(analysis.soundedDismissive).toBe(true);
    expect(analysis.soundedRude).toBe(true);
    expect(analysis.blameShifting).toBe(true);
    expect(analysis.disrespect).toBe(true);
    expect(analysis.respectfulness).toBeLessThanOrEqual(2);
  });

  it("treats emergency control language as appropriate escalation and direction", () => {
    const analysis = analyzeEmployeeUtterance(
      "I am taking control now. Stay with them if it is safe, keep the area clear, and wave emergency response to cardio.",
      createScenario({
        department: "mod_emergency",
        employee_role: "Manager on Duty",
        scenario_family: "emergency_response",
      }),
      { latestCustomerMessage: "Someone collapsed near cardio." },
    );

    expect(analysis.professionalism).toBeGreaterThanOrEqual(6);
    expect(analysis.explicitDirection).toBe(true);
    expect(analysis.explicitSafetyControl).toBe(true);
    expect(analysis.escalationJudgment).toBeGreaterThanOrEqual(ANALYZER_REACTION_THRESHOLDS.competenceGainMin);
  });

  it("can merge optional LLM-assisted scoring without losing heuristic flags", () => {
    const heuristic = analyzeEmployeeUtterance(
      "I think maybe we can probably take a look.",
      createScenario(),
      { latestCustomerMessage: "What happens next?" },
    );
    const merged = mergeLlmAssistedAnalysis(heuristic, {
      clarity: 2,
      fakeConfidence: true,
      notes: ["LLM classified the answer as weakly confident without specifics."],
    });

    expect(merged.clarity).toBe(2);
    expect(merged.fakeConfidence).toBe(true);
    expect(merged.issues.some((issue) => issue.includes("LLM classified"))).toBe(true);
  });

  it("builds a compact prompt payload for optional LLM-assisted classification", () => {
    const heuristic = analyzeEmployeeUtterance(
      "I can check that for you and update you this afternoon.",
      createScenario(),
      { latestCustomerMessage: "Can you tell me what is happening?" },
    );
    const payload = buildUtteranceAnalysisPromptPayload({
      message: "I can check that for you and update you this afternoon.",
      scenario: createScenario(),
      heuristic,
      context: {
        latestCustomerMessage: "Can you tell me what is happening?",
        priorPromisesMade: ["I will send you the confirmation today."],
      },
    });

    expect(payload.scenario.scenario_family).toBe("billing_confusion");
    expect(payload.context.latest_customer_message).toContain("what is happening");
    expect(payload.heuristic_analysis.setExpectationsClearly).toBe(false);
  });

  it("lowers clarity and confidence when the same words are delivered in a rushed, fragmented way", () => {
    const baseline = analyzeEmployeeUtterance(
      "I can check that for you and update you this afternoon.",
      createScenario(),
      { latestCustomerMessage: "What happens next?" },
    );
    const deliveryWeighted = analyzeEmployeeUtterance(
      "I can check that for you and update you this afternoon.",
      createScenario(),
      {
        latestCustomerMessage: "What happens next?",
        deliveryAnalysis: {
          pacing: {
            hesitationRisk: "high",
          },
          delivery: {
            rushedRisk: "high",
            fragmentationRisk: "high",
            pacingStabilityRisk: "high",
            sharpnessRisk: "medium",
            interruptionRisk: "medium",
            loudnessConsistency: "erratic",
            intensity: "high",
          },
          coachingSignals: ["Delivery sounded rushed and fragmented."],
        },
      },
    );

    expect(deliveryWeighted.clarity).toBeLessThan(baseline.clarity);
    expect(deliveryWeighted.confidence).toBeLessThan(baseline.confidence);
    expect(deliveryWeighted.issues).toContain("delivery sounded rushed");
    expect(deliveryWeighted.issues).toContain("delivery sounded fragmented");
  });
});
