import { describe, expect, it } from "vitest";
import { applyEmotionalReaction, buildNegativeCustomerReaction, EMOTIONAL_REACTION_THRESHOLDS } from "./emotion";
import { analyzeEmployeeUtterance } from "./analysis";
import { buildDefaultConversationState } from "./engine";
import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";

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
      membership_context: "Long-time member who watches billing closely",
      communication_style: "direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees two membership-related charges and wants a clear explanation.",
    opening_line: "I need to know why I got charged twice and what you're doing about it.",
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

function makeDraft(message: string, scenario = createScenario(), transcript: TranscriptTurn[] = []) {
  const priorState = buildDefaultConversationState(scenario);
  const analysis = analyzeEmployeeUtterance(message, scenario, {
    latestCustomerMessage: transcript[transcript.length - 1]?.message || scenario.opening_line,
  });
  const draftState = {
    ...priorState,
    trust_level: 4,
    issue_clarity: 4,
    cooperation_level: 5,
    offense_level: 2,
    manager_request_level: 1,
    goal_status: "ACTIVE" as const,
    accepted_next_step: false,
    valid_redirect: false,
    premature_closure_detected: false,
    unmet_completion_criteria: [],
    outcome_summary: "",
    latest_employee_analysis: analysis,
  };

  return { scenario, priorState, analysis, draftState, transcript };
}

describe("emotional reaction engine", () => {
  it("calms the customer and raises trust when the employee is clear and takes ownership", () => {
    const transcript: TranscriptTurn[] = [{ role: "customer", message: "What are you doing about this?" }];
    const setup = makeDraft(
      "I can see why this is frustrating. I am pulling up your ledger now, and I will confirm which charge is pending and give you the next step before you leave.",
      createScenario(),
      transcript,
    );

    const result = applyEmotionalReaction({
      scenario: setup.scenario,
      priorState: setup.priorState,
      draftState: setup.draftState,
      analysis: setup.analysis,
      recentConversationHistory: transcript,
    });

    expect(result.updatedState.trust_level).toBeGreaterThan(setup.priorState.trust_level);
    expect(result.updatedState.emotion_state).toMatch(/calmer|reassured|concerned/);
    expect(result.responseStrategy).toBe("seek_reassurance");
  });

  it("compounds frustration after repeated weak responses", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "What are you doing about this?" },
      { role: "employee", message: "We will look into it and get back to you." },
      { role: "customer", message: "That still does not tell me anything." },
      { role: "employee", message: "We will look into it and get back to you." },
    ];
    const setup = makeDraft(
      "We will look into it and get back to you.",
      createScenario(),
      transcript,
    );

    const result = applyEmotionalReaction({
      scenario: setup.scenario,
      priorState: setup.priorState,
      draftState: setup.draftState,
      analysis: setup.analysis,
      recentConversationHistory: transcript,
    });

    expect(result.updatedState.cooperation_level).toBeLessThanOrEqual(EMOTIONAL_REACTION_THRESHOLDS.disengageHelpfulnessMax + 2);
    expect(result.likelyNextBehavior).toMatch(/ask_follow_up|become_cautious|disengage/);
    expect(result.emotionalShiftExplanation.toLowerCase()).toMatch(/trust dropped|confusion increased|unproductive/);
  });

  it("pushes toward a manager when the employee is disrespectful", () => {
    const transcript: TranscriptTurn[] = [{ role: "customer", message: "Can you fix this?" }];
    const setup = makeDraft(
      "Calm down. That's not my problem and you need to talk to someone else.",
      createScenario(),
      transcript,
    );

    const result = applyEmotionalReaction({
      scenario: setup.scenario,
      priorState: setup.priorState,
      draftState: setup.draftState,
      analysis: setup.analysis,
      recentConversationHistory: transcript,
    });

    expect(result.updatedState.offense_level).toBeGreaterThanOrEqual(6);
    expect(result.updatedState.manager_request_level).toBeGreaterThanOrEqual(5);
    expect(result.likelyNextBehavior).toMatch(/request_manager|become_defensive/);
  });

  it("becomes confused when the employee gives conflicting information", () => {
    const transcript: TranscriptTurn[] = [{ role: "customer", message: "Is the pending charge final or not?" }];
    const setup = makeDraft(
      "It is pending, but it already posted and there is nothing to review.",
      createScenario(),
      transcript,
    );

    const result = applyEmotionalReaction({
      scenario: setup.scenario,
      priorState: setup.priorState,
      draftState: setup.draftState,
      analysis: setup.analysis,
      recentConversationHistory: transcript,
    });

    expect(result.updatedState.issue_clarity).toBeLessThanOrEqual(setup.draftState.issue_clarity);
    expect(result.updatedState.emotion_state).toBe("confused");
  });

  it("allows patient quieter personas to withdraw instead of always escalating", () => {
    const scenario = createScenario({
      customer_persona: {
        name: "Marcus Bell",
        age_band: "40-50",
        membership_context: "Busy parent who wants a straight answer.",
        communication_style: "skeptical but polite",
        initial_emotion: "concerned",
        patience_level: "high",
      },
    });
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "Can you tell me what is happening?" },
      { role: "employee", message: "We will look into it and get back to you." },
      { role: "customer", message: "That still does not answer me." },
      { role: "employee", message: "We will look into it and get back to you." },
    ];
    const setup = makeDraft("We will look into it and get back to you.", scenario, transcript);

    const result = applyEmotionalReaction({
      scenario,
      priorState: setup.priorState,
      draftState: setup.draftState,
      analysis: setup.analysis,
      recentConversationHistory: transcript,
    });

    expect(result.likelyNextBehavior).toMatch(/become_cautious|disengage|ask_follow_up/);
  });

  it("classifies poor service into mild, moderate, and severe failure levels", () => {
    const scenario = createScenario();
    const priorState = buildDefaultConversationState(scenario);

    const mildAnalysis = analyzeEmployeeUtterance("We will look into it and get back to you.", scenario, {
      latestCustomerMessage: "What are you doing about this?",
    });
    const moderateAnalysis = analyzeEmployeeUtterance("I already told you, we need to wait and see what happens.", scenario, {
      latestCustomerMessage: "What are you doing about this?",
    });
    const severeAnalysis = analyzeEmployeeUtterance("Calm down. That's your fault, not ours.", scenario, {
      latestCustomerMessage: "Can you fix this?",
    });

    expect(buildNegativeCustomerReaction({
      scenario,
      priorState,
      state: priorState,
      analysis: mildAnalysis,
      recentConversationHistory: [],
    }).failureLevel).toBe("mild");
    expect(buildNegativeCustomerReaction({
      scenario,
      priorState,
      state: priorState,
      analysis: moderateAnalysis,
      recentConversationHistory: [],
    }).failureLevel).toBe("moderate");
    expect(buildNegativeCustomerReaction({
      scenario,
      priorState,
      state: priorState,
      analysis: severeAnalysis,
      recentConversationHistory: [],
    }).failureLevel).toBe("severe");
  });

  it("makes three personas react differently to the same bad employee line", () => {
    const badLine = "I already told you. That's not really our issue, so you'll have to deal with it.";
    const directScenario = createScenario({
      customer_persona: {
        name: "Erin Calloway",
        age_band: "35-45",
        membership_context: "Long-time member who expects clarity and follow-through.",
        communication_style: "direct and organized",
        initial_emotion: "frustrated",
        patience_level: "moderate",
      },
    });
    const quietScenario = createScenario({
      customer_persona: {
        name: "Marcus Bell",
        age_band: "40-50",
        membership_context: "Busy parent who wants the answer without wasting time.",
        communication_style: "skeptical but polite",
        initial_emotion: "concerned",
        patience_level: "high",
      },
    });
    const warmScenario = createScenario({
      customer_persona: {
        name: "Nina Park",
        age_band: "30-40",
        membership_context: "Reasonable until she feels brushed off.",
        communication_style: "warm until dismissed",
        initial_emotion: "disappointed",
        patience_level: "moderate",
      },
    });

    const directReaction = buildNegativeCustomerReaction({
      scenario: directScenario,
      priorState: buildDefaultConversationState(directScenario),
      state: buildDefaultConversationState(directScenario),
      analysis: analyzeEmployeeUtterance(badLine, directScenario, { latestCustomerMessage: "Can you fix this?" }),
      recentConversationHistory: [],
    });
    const quietReaction = buildNegativeCustomerReaction({
      scenario: quietScenario,
      priorState: buildDefaultConversationState(quietScenario),
      state: buildDefaultConversationState(quietScenario),
      analysis: analyzeEmployeeUtterance(badLine, quietScenario, { latestCustomerMessage: "Can you fix this?" }),
      recentConversationHistory: [],
    });
    const warmReaction = buildNegativeCustomerReaction({
      scenario: warmScenario,
      priorState: buildDefaultConversationState(warmScenario),
      state: buildDefaultConversationState(warmScenario),
      analysis: analyzeEmployeeUtterance(badLine, warmScenario, { latestCustomerMessage: "Can you fix this?" }),
      recentConversationHistory: [],
    });

    expect(directReaction.sampleReaction).not.toBe(quietReaction.sampleReaction);
    expect(warmReaction.sampleReaction).not.toBe(quietReaction.sampleReaction);
  });
});
