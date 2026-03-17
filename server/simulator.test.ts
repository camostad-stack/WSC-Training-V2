import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { buildUtteranceAnalysisDefaults } from "./services/simulation/analysis";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { invokeLLM } from "./_core/llm";
const mockInvokeLLM = vi.mocked(invokeLLM);

function createPublicContext(): TrpcContext {
  return {
    user: null,
    actorUser: null,
    impersonation: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@wsc.com",
      name: "Test Employee",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    actorUser: {
      id: 1,
      openId: "test-user",
      email: "test@wsc.com",
      name: "Test Employee",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    impersonation: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function mockLLMResponse(data: unknown) {
  mockInvokeLLM.mockResolvedValueOnce({
    id: "test-id",
    created: Date.now(),
    model: "test-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify(data),
        },
        finish_reason: "stop",
      },
    ],
  });
}

function createScenarioFixture(overrides: Record<string, unknown> = {}) {
  return {
    scenario_id: "WSC-FIXTURE-1",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Active member with billing concern",
      communication_style: "Direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees charges they do not understand and wants a clear answer.",
    opening_line: "I need to know why I was charged twice and what you are going to do about it.",
    hidden_facts: ["One charge is pending and one is final."],
    approved_resolution_paths: ["Verify the ledger and explain the next step clearly."],
    required_behaviors: ["Show empathy", "Take ownership", "Give a direct next step"],
    critical_errors: ["Blame the customer", "Guess at billing policy"],
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

// ─── Prompt 1: Scenario Director ───

describe("simulator.generateScenario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls LLM and returns a parsed scenario with branch logic", async () => {
    const mockScenario = {
      scenario_id: "WSC-2026-0309-IP-5A",
      department: "Customer Service",
      employee_role: "Front Desk Associate",
      difficulty: 5,
      scenario_family: "billing_confusion",
      customer_persona: {
        name: "Karen Whitfield",
        age_band: "40-50",
        membership_context: "Premium Family Member since 2022",
        communication_style: "Assertive and direct",
        initial_emotion: "angry",
        patience_level: "low",
      },
      situation_summary: "Customer is upset about double billing.",
      opening_line: "I need to speak with someone who can fix things.",
      hidden_facts: ["Double charge is a known glitch."],
      approved_resolution_paths: ["Issue refund and apologize"],
      required_behaviors: ["Acknowledge billing error", "Show empathy"],
      critical_errors: ["Denying the charge exists"],
      branch_logic: {
        if_empathy_is_strong: "Customer calms slightly",
        if_answer_is_vague: "Customer becomes more frustrated",
        if_policy_is_wrong: "Customer demands manager",
        if_employee_takes_ownership: "Customer begins to trust",
        if_employee_fails_to_help: "Customer escalates",
        if_employee_escalates_correctly: "Customer accepts handoff",
      },
      emotion_progression: {
        starting_state: "angry",
        better_if: ["Employee shows empathy", "Employee takes ownership"],
        worse_if: ["Employee is dismissive", "Employee gives wrong info"],
      },
      completion_rules: {
        resolved_if: ["Refund issued and confirmed"],
        end_early_if: ["Employee makes critical safety error"],
        manager_required_if: ["Customer asks for manager twice"],
      },
      recommended_turns: 4,
    };

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.generateScenario({
      department: "customer_service",
      employeeRole: "Front Desk Associate",
      difficulty: 5,
      mode: "in_person",
    });

    expect(result.scenario).toBeDefined();
    const scenario = result.scenario as any;
    expect(scenario.scenario_id).toMatch(/^seed-/);
    expect(scenario.department).toBe("customer_service");
    expect(scenario.branch_logic).toBeDefined();
    expect(scenario.emotion_progression).toBeDefined();
    expect(scenario.completion_rules).toBeDefined();
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("selects a matching fallback scenario family from the bundled WSC catalog", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.generateScenario({
      department: "customer_service",
      employeeRole: "CS Team Member",
      difficulty: 3,
      mode: "phone",
      scenarioFamily: "reservation_issue",
    });

    expect((result.scenario as any).scenario_family).toBe("reservation_issue");
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("falls back to a bundled WSC scenario when AI is unavailable", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.generateScenario({
      department: "customer_service",
      employeeRole: "CS Team Member",
      difficulty: 1,
      mode: "in_person",
    });

    expect((result.scenario as any).scenario_id).toMatch(/^seed-/);
    expect((result.scenario as any).recommended_turns).toBeGreaterThanOrEqual(3);
  });
});

// ─── Prompt 2+3: Customer Reply + State Manager ───

describe("simulator.customerReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns customer reply with trust/clarity and state update", async () => {
    const mockCustomerReply = {
      customer_reply: "Thank you for looking into this.",
      updated_emotion: "concerned",
      trust_level: 5,
      issue_clarity: 6,
      manager_needed: false,
      scenario_complete: false,
      completion_reason: "",
      new_hidden_fact_revealed: "",
      director_notes: {
        employee_showed_empathy: true,
        employee_was_clear: true,
        employee_used_correct_policy: true,
        employee_took_ownership: true,
        employee_should_be_pushed_harder: false,
      },
    };

    const mockStateUpdate = {
      turn_number: 1,
      emotion_state: "concerned",
      trust_level: 5,
      issue_clarity: 6,
      employee_flags: {
        showed_empathy: true,
        answered_directly: true,
        used_correct_policy: true,
        took_ownership: true,
        avoided_question: false,
        critical_error: false,
      },
      escalation_required: false,
      scenario_risk_level: "moderate",
      continue_simulation: true,
    };

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.customerReply({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I have a problem." },
      ],
      employeeResponse: "I'm sorry to hear that. Let me help you.",
    });

    expect(result.customerReply.customer_reply.length).toBeGreaterThan(0);
    expect(result.customerReply.trust_level).toBeGreaterThan(0);
    expect(result.customerReply.director_notes.employee_showed_empathy).toBe(true);
    expect(result.stateUpdate.turn_number).toBe(1);
    expect(result.stateUpdate.employee_flags.showed_empathy).toBe(true);
    expect(["low", "moderate"]).toContain(result.stateUpdate.scenario_risk_level);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("handles scenario completion", async () => {
    const mockCustomerReply = {
      customer_reply: "Thank you so much, I really appreciate your help.",
      updated_emotion: "relieved",
      trust_level: 9,
      issue_clarity: 10,
      manager_needed: false,
      scenario_complete: true,
      completion_reason: "Issue resolved satisfactorily",
      new_hidden_fact_revealed: "",
      director_notes: {
        employee_showed_empathy: true,
        employee_was_clear: true,
        employee_used_correct_policy: true,
        employee_took_ownership: true,
        employee_should_be_pushed_harder: false,
      },
    };

    const mockStateUpdate = {
      turn_number: 4,
      emotion_state: "relieved",
      trust_level: 9,
      issue_clarity: 10,
      employee_flags: {
        showed_empathy: true,
        answered_directly: true,
        used_correct_policy: true,
        took_ownership: true,
        avoided_question: false,
        critical_error: false,
      },
      escalation_required: false,
      scenario_risk_level: "low",
      continue_simulation: false,
    };

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.customerReply({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "Let me fix that for you." },
        { role: "customer", message: "Okay, what can you do?" },
        { role: "employee", message: "I am checking the ledger and I will explain the exact charge." },
        { role: "customer", message: "Fine, I just want a clear answer." },
      ],
      employeeResponse: "I understand why this is frustrating. I will verify the account, process the refund now, and give you the confirmation before you leave.",
    });

    expect(result.customerReply.scenario_complete).toBe(true);
    expect(["relieved", "calmer", "reassured", "steady"]).toContain(result.customerReply.updated_emotion);
    expect(result.stateUpdate.continue_simulation).toBe(false);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("uses the emergency goal to ask for the next operational step instead of repeating generic frustration", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.customerReply({
      scenarioJson: createScenarioFixture({
        department: "mod_emergency",
        employee_role: "Manager on Duty",
        scenario_family: "emergency_response",
        customer_persona: {
          name: "Alicia Gomez",
          age_band: "30-40",
          membership_context: "Witness to an urgent incident",
          communication_style: "Alarmed and urgent",
          initial_emotion: "alarmed",
          patience_level: "low",
        },
        hidden_facts: ["The employee should direct the witness and stabilize until care arrives."],
      }),
      transcript: [
        { role: "customer", message: "Someone collapsed near cardio." },
      ],
      employeeResponse: "I am activating emergency response now and taking control of this.",
    });

    expect(result.customerReply.customer_reply.toLowerCase()).toContain("what do you need");
    expect(result.customerReply.customer_reply).not.toContain("frustration");
    expect(["concerned", "steady"]).toContain(result.customerReply.updated_emotion);
  });

  it("pushes golf conversations toward discovery before pitching", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.customerReply({
      scenarioJson: createScenarioFixture({
        department: "golf",
        employee_role: "Golf Membership Advisor",
        scenario_family: "value_explanation",
        customer_persona: {
          name: "Liam Hart",
          age_band: "35-45",
          membership_context: "Prospect comparing clubs",
          communication_style: "Curious but hesitant",
          initial_emotion: "skeptical",
          patience_level: "moderate",
        },
        hidden_facts: ["The prospect needs a clear recommendation that fits their goals."],
      }),
      transcript: [
        { role: "customer", message: "Why is this worth it for me?" },
      ],
      employeeResponse: "We have a great club with a lot of value and premium amenities.",
    });

    expect(result.customerReply.customer_reply.toLowerCase()).toMatch(/pitching me|actually looking for/);
    expect(result.stateUpdate.continue_simulation).toBe(true);
  });

  it("moves front-desk follow-up questions forward as the employee handles each missing objective", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const scenario = createScenarioFixture();

    const firstTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
      ],
      employeeResponse: "I can see why that would be frustrating, and I am taking ownership of this.",
    });

    expect(firstTurn.customerReply.customer_reply.toLowerCase()).toContain("checking or confirming");

    const secondTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I can see why that would be frustrating, and I am taking ownership of this." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.customerReply.updated_emotion },
      ],
      employeeResponse: "I am pulling up the ledger now to verify which charge is pending and which one is final.",
    });

    expect(secondTurn.customerReply.customer_reply.toLowerCase()).toContain("what is the next concrete step from here for me");
    expect(secondTurn.customerReply.customer_reply).not.toContain("checking or confirming");

    const thirdTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I can see why that would be frustrating, and I am taking ownership of this." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.customerReply.updated_emotion },
        { role: "employee", message: "I am pulling up the ledger now to verify which charge is pending and which one is final." },
        { role: "customer", message: secondTurn.customerReply.customer_reply, emotion: secondTurn.customerReply.updated_emotion },
      ],
      employeeResponse: "I will reverse the pending charge now and email the confirmation within 15 minutes.",
    });

    expect(thirdTurn.customerReply.customer_reply).not.toContain("checking or confirming");
    expect(thirdTurn.customerReply.customer_reply).not.toContain("What happens next for me now");
    expect(thirdTurn.customerReply.updated_emotion).toMatch(/reassured|calmer|steady/);
  });

  it("moves emergency follow-up from control to direction to update instead of repeating the same ask", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const scenario = createScenarioFixture({
      department: "mod_emergency",
      employee_role: "Manager on Duty",
      scenario_family: "emergency_response",
      customer_persona: {
        name: "Alicia Gomez",
        age_band: "30-40",
        membership_context: "Witness to an urgent incident",
        communication_style: "Alarmed and urgent",
        initial_emotion: "alarmed",
        patience_level: "low",
      },
      hidden_facts: ["The witness needs direct instructions and updates until care arrives."],
      completion_rules: {
        resolved_if: ["Emergency response and scene control are clearly underway."],
        end_early_if: ["Employee makes a critical emergency response error."],
        manager_required_if: [],
      },
      completion_criteria: [
        "employee takes control immediately",
        "customer received direct instructions",
        "customer acknowledged the next update until care arrives",
      ],
      failure_criteria: [
        "employee delayed emergency action",
        "no direct instruction was given",
        "no clear update path until care arrives",
      ],
    });

    const firstTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "Someone collapsed near cardio." },
      ],
      employeeResponse: "I am activating emergency response now and taking control of this.",
    });

    expect(firstTurn.customerReply.customer_reply.toLowerCase()).toContain("what do you need");

    const secondTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "Someone collapsed near cardio." },
        { role: "employee", message: "I am activating emergency response now and taking control of this." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.customerReply.updated_emotion },
      ],
      employeeResponse: "Stay with them if it is safe, keep the area clear, and wave emergency response to the cardio floor.",
    });

    expect(secondTurn.customerReply.customer_reply.toLowerCase()).toContain("next update");
    expect(secondTurn.customerReply.customer_reply).not.toContain("What do you need me to do right now");

    const thirdTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "Someone collapsed near cardio." },
        { role: "employee", message: "I am activating emergency response now and taking control of this." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.customerReply.updated_emotion },
        { role: "employee", message: "Stay with them if it is safe, keep the area clear, and wave emergency response to the cardio floor." },
        { role: "customer", message: secondTurn.customerReply.customer_reply, emotion: secondTurn.customerReply.updated_emotion },
      ],
      employeeResponse: "Emergency response is on the way, and I will keep you updated until care arrives.",
    });

    expect(thirdTurn.customerReply.customer_reply.toLowerCase()).toMatch(/keep me updated until care arrives|until help gets here|until care arrives|fully handed off/);
    expect(thirdTurn.stateUpdate.continue_simulation).toBe(false);
  });

  it("moves golf follow-up from discovery to recommendation to close instead of looping on discovery", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const scenario = createScenarioFixture({
      department: "golf",
      employee_role: "Golf Membership Advisor",
      scenario_family: "hesitant_prospect",
      customer_persona: {
        name: "Liam Hart",
        age_band: "35-45",
        membership_context: "Prospect comparing clubs",
        communication_style: "Curious but hesitant",
        initial_emotion: "skeptical",
        patience_level: "moderate",
      },
      situation_summary: "A prospect is interested but unsure the membership fits their routine.",
      opening_line: "I like the club, but I do not know if this actually fits me.",
      hidden_facts: ["The prospect needs a clear fit recommendation and a clean next step."],
    });

    const firstTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "I like the club, but I do not know if this actually fits me." },
      ],
      employeeResponse: "We have a great club with a lot of amenities and value.",
    });

    expect(firstTurn.customerReply.customer_reply.toLowerCase()).toMatch(/pitching me|actually looking for/);

    const secondTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "I like the club, but I do not know if this actually fits me." },
        { role: "employee", message: "We have a great club with a lot of amenities and value." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.customerReply.updated_emotion },
      ],
      employeeResponse: "Welcome in. What are you hoping to get out of the club most right now?",
    });

    expect(secondTurn.customerReply.customer_reply).toContain("what would you actually recommend");
    expect(secondTurn.customerReply.customer_reply).not.toContain("ask what I’m actually looking for");

    const thirdTurn = await caller.simulator.customerReply({
      scenarioJson: scenario,
      transcript: [
        { role: "customer", message: "I like the club, but I do not know if this actually fits me." },
        { role: "employee", message: "We have a great club with a lot of amenities and value." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.customerReply.updated_emotion },
        { role: "employee", message: "Welcome in. What are you hoping to get out of the club most right now?" },
        { role: "customer", message: secondTurn.customerReply.customer_reply, emotion: secondTurn.customerReply.updated_emotion },
      ],
      employeeResponse: "Based on that, I recommend the flexible range membership, and I can get the next step moving for you today.",
    });

    expect(thirdTurn.customerReply.customer_reply.toLowerCase()).toMatch(/i can picture the next step now|next step now|what happens next now/);
    expect(thirdTurn.customerReply.customer_reply).not.toContain("what would you actually recommend");
  });
});

// ─── Prompt 6: Full Evaluation (includes policy grounding) ───

describe("simulator.evaluate", () => {
  const originalForgeApiKey = ENV.forgeApiKey;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    ENV.forgeApiKey = originalForgeApiKey;
  });

  it("returns completed deterministic evaluation when AI is unavailable", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "I understand your frustration." },
        { role: "customer", message: "I was double charged for my membership." },
        { role: "employee", message: "I can verify that charge and explain the next step for you." },
      ],
      employeeRole: "Front Desk Associate",
    });

    expect(result.evaluation).toBeDefined();
    const evaluation = result.evaluation as any;
    expect(result.processingStatus).toBe("completed");
    expect(evaluation.overall_score).toBeGreaterThan(0);
    expect(typeof evaluation.pass_fail).toBe("string");
    expect(typeof evaluation.readiness_signal).toBe("string");
    expect(evaluation.category_scores.opening_warmth).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(evaluation.best_moments)).toBe(true);
    expect(result.policyGrounding).toBeDefined();
    expect(result.coaching).toBeDefined();
    expect(result.managerDebrief).toBeDefined();
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("does not reprocess a short session just because the conversation was brief", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "Okay." },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.failure).toBeUndefined();
    expect((result.evaluation as any).overall_score).toBeGreaterThanOrEqual(0);
    expect((result.evaluation as any).score_dimensions.outcome_quality).toBeLessThanOrEqual(30);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("does not require AI output for a valid completed fallback evaluation", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "I understand your frustration." },
        { role: "customer", message: "I was double charged." },
        { role: "employee", message: "I can verify the charge right now." },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect((result.evaluation as any).overall_score).toBeGreaterThan(0);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("uses an emergency-response scoring and coaching lens that prioritizes control over policy recital", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture({
        department: "mod_emergency",
        employee_role: "Manager on Duty",
        scenario_family: "emergency_response",
        customer_persona: {
          name: "Alicia Gomez",
          age_band: "30-40",
          membership_context: "Witness to an urgent incident",
          communication_style: "Alarmed and urgent",
          initial_emotion: "alarmed",
          patience_level: "low",
        },
        situation_summary: "A witness reports that someone collapsed near the cardio area.",
        opening_line: "Someone just collapsed near cardio. We need help right now.",
        hidden_facts: ["The employee should take control and stabilize until care arrives."],
        approved_resolution_paths: ["Activate emergency response and control the scene."],
        required_behaviors: ["Take control", "Give simple directions", "Escalate immediately"],
        critical_errors: ["Delay emergency action"],
      }),
      transcript: [
        { role: "customer", message: "Someone just collapsed near cardio." },
        { role: "employee", message: "I am activating emergency response now. Stay with them if it is safe, keep the area clear, and I will stay in control until care arrives." },
        { role: "customer", message: "Okay, what do you need from me?" },
        { role: "employee", message: "Call out if they start moving, keep people back, and I will update you as medical help gets here." },
      ],
      employeeRole: "Manager on Duty",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.evaluation.best_moments).toContain("Stayed focused on stabilizing the situation until care arrived.");
    expect(result.policyGrounding.policy_notes).toContain("Immediate emergency control was prioritized");
    expect(result.coaching.practice_focus).toBe("stabilize_until_care_arrives");
    expect(result.coaching.do_this_next_time[0]).toContain("Take control");
    expect(result.evaluation.ideal_response_example).toContain("until care arrives");
  });

  it("uses a golf scoring and coaching lens that emphasizes opening warmth and closing control", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture({
        department: "golf",
        employee_role: "Golf Membership Advisor",
        scenario_family: "value_explanation",
        customer_persona: {
          name: "Liam Hart",
          age_band: "35-45",
          membership_context: "Prospect comparing clubs",
          communication_style: "Curious but hesitant",
          initial_emotion: "skeptical",
          patience_level: "moderate",
        },
        situation_summary: "A prospect wants to know why WSC golf is worth the cost.",
        opening_line: "I like the club, but I need to know why this is worth it for me.",
        hidden_facts: ["The prospect mainly needs the right fit and a confident next step."],
        approved_resolution_paths: ["Use discovery before making the value case."],
        required_behaviors: ["Open warmly", "Ask one discovery question", "Close with control"],
        critical_errors: ["Launch into a generic pitch without discovery"],
      }),
      transcript: [
        { role: "customer", message: "I need to know why this is worth it for me." },
        { role: "employee", message: "Welcome in. What are you hoping to get out of the club most right now?" },
        { role: "customer", message: "Convenience and more regular practice time." },
        { role: "employee", message: "That helps. Based on that, the best fit is the membership that gives you flexible range access, and I can walk you through the next step today." },
      ],
      employeeRole: "Golf Membership Advisor",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.coaching.practice_focus).toBe("opening_warmth_and_closing_control");
    expect(result.coaching.do_this_next_time[0]).toContain("Open warmer");
    expect(result.coaching.replacement_phrases[0]).toContain("Welcome in");
    expect(result.evaluation.ideal_response_example).toContain("best fit");
  });

  it("keeps scoring the session when policy grounding fails", async () => {
    ENV.forgeApiKey = "test-forge-key";

    mockInvokeLLM.mockRejectedValueOnce(new Error("policy grounding unavailable"));
    mockLLMResponse({
      session_quality: "valid",
      flags: [],
      reason: "",
      retry_recommended: false,
    });
    mockLLMResponse({
      overall_score: 78,
      pass_fail: "pass",
      readiness_signal: "ready_with_coaching",
      category_scores: {
        opening_warmth: 7,
        listening_empathy: 7,
        clarity_directness: 7,
        policy_accuracy: 6,
        ownership: 8,
        problem_solving: 7,
        de_escalation: 6,
        escalation_judgment: 6,
        visible_professionalism: 0,
        closing_control: 7,
      },
      score_dimensions: {
        interaction_quality: 74,
        operational_effectiveness: 76,
        outcome_quality: 82,
      },
      best_moments: ["Took ownership of the billing issue."],
      missed_moments: ["Could have named the follow-up timeline sooner."],
      critical_mistakes: [],
      coachable_mistakes: ["Add the timeline earlier."],
      most_important_correction: "State the owner and timeline earlier in the call.",
      ideal_response_example: "I can see one pending charge and one final charge. I am escalating this to billing today, and you will hear back by 3 PM.",
      summary: "Solid handling with a concrete next step.",
    });
    mockLLMResponse({
      employee_coaching_summary: "You moved the billing issue forward with ownership.",
      what_you_did_well: ["Took ownership quickly."],
      what_hurt_you: ["Delayed the timeline."],
      do_this_next_time: ["Name the billing owner and callback time earlier."],
      replacement_phrases: ["I am escalating this to billing today, and you will hear back by 3 PM."],
      practice_focus: "timeline_control",
      next_recommended_scenario: "repeat_current_scenario",
    });
    mockLLMResponse({
      manager_summary: "The rep handled the issue well overall and should tighten timeline control.",
      performance_signal: "yellow",
      top_strengths: ["Ownership"],
      top_corrections: ["Earlier timeline clarity"],
      whether_live_shadowing_is_needed: false,
      whether_manager_follow_up_is_needed: false,
      recommended_follow_up_action: "Coach on naming owner and timeline faster.",
      recommended_next_drill: "timeline_control",
    });

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "Why are there two charges on my account?" },
        { role: "employee", message: "I can see one pending charge and one final charge, and I am escalating this to billing today." },
        { role: "customer", message: "Okay, when am I hearing back?" },
        { role: "employee", message: "You will hear back by 3 PM today." },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.failure).toBeUndefined();
    expect(result.policyGrounding.policy_accuracy).toBe("not_evaluated");
    expect(result.policyGrounding.policy_notes).toContain("scoring continued without policy-specific grading");
    expect(result.evaluation.overall_score).toBeGreaterThan(0);
    expect(result.coaching.employee_coaching_summary).toContain("ownership");
  });

  it("falls back to deterministic coaching and manager debrief when those prompts fail", async () => {
    ENV.forgeApiKey = "test-forge-key";

    mockLLMResponse({
      policy_accuracy: "partially_correct",
      matched_policy_points: ["Referenced a concrete billing next step."],
      missed_policy_points: [],
      invented_or_risky_statements: [],
      should_have_escalated: false,
      policy_notes: "Policy grounding succeeded.",
    });
    mockLLMResponse({
      session_quality: "valid",
      flags: [],
      reason: "",
      retry_recommended: false,
    });
    mockLLMResponse({
      overall_score: 74,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {
        opening_warmth: 6,
        listening_empathy: 7,
        clarity_directness: 7,
        policy_accuracy: 7,
        ownership: 8,
        problem_solving: 7,
        de_escalation: 6,
        escalation_judgment: 6,
        visible_professionalism: 0,
        closing_control: 6,
      },
      score_dimensions: {
        interaction_quality: 71,
        operational_effectiveness: 73,
        outcome_quality: 78,
      },
      best_moments: ["Took ownership and named the billing path."],
      missed_moments: ["Could have named the callback timeline faster."],
      critical_mistakes: [],
      coachable_mistakes: ["State the callback time earlier."],
      most_important_correction: "State the billing callback time earlier.",
      ideal_response_example: "I can see one pending charge and one final charge, and billing will call you back by 3 PM today.",
      summary: "A mostly solid billing explanation with a usable next step.",
    });
    mockInvokeLLM.mockRejectedValueOnce(new Error("coaching unavailable"));
    mockInvokeLLM.mockRejectedValueOnce(new Error("manager debrief unavailable"));

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "Why are there two charges on my account?" },
        { role: "employee", message: "I can see one pending charge and one final charge." },
        { role: "customer", message: "Okay, what happens next?" },
        { role: "employee", message: "I am escalating this to billing, and you will hear back this afternoon." },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.failure).toBeUndefined();
    expect(result.evaluation.overall_score).toBeGreaterThan(0);
    expect(result.coaching.employee_coaching_summary).toContain("Coaching prompt fallback was used");
    expect(result.managerDebrief.manager_summary).toContain("Manager debrief fallback was used");
    expect(result.managerDebrief.recommended_next_drill).toBeTruthy();
  });

  it("caps outcome-gated scores when the employee tries to close without a real outcome", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I understand why that is frustrating, and I am looking at it." },
        { role: "customer", message: "Okay, but what exactly happens next?" },
        { role: "employee", message: "That should take care of it. You are all set." },
      ],
      stateHistory: [
        {
          turn_number: 1,
          emotion_state: "frustrated",
          trust_level: 3,
          issue_clarity: 4,
          employee_flags: {
            showed_empathy: true,
            answered_directly: false,
            used_correct_policy: false,
            took_ownership: true,
            avoided_question: true,
            critical_error: false,
          },
          escalation_required: false,
          scenario_risk_level: "moderate",
          continue_simulation: true,
          customer_goal: "Own The Issue And Give The Next Update",
          goal_status: "ACTIVE",
          accepted_next_step: false,
          valid_redirect: false,
          premature_closure_detected: false,
          unmet_completion_criteria: ["Customer understands the charge and next step."],
          outcome_summary: "Conversation is still active.",
          patience_level: 4,
          urgency_level: 5,
          communication_style: "Direct and organized",
          cooperation_level: 5,
          offense_level: 2,
          manager_request_level: 2,
          resolution_confidence: 2,
          customer_strategy: "seek_clarity",
          likely_next_behavior: "ask_follow_up",
          emotional_shift_explanation: "Customer still needs a concrete answer.",
          conversation_stage: "fact_finding",
          analysis_summary: "Employee acknowledged the concern but did not create a real next step.",
          latest_employee_analysis: {
            ...buildUtteranceAnalysisDefaults(),
            empathy: 8,
            warmth: 6,
            respectfulness: 7,
            professionalism: 6,
            ownership: 7,
            tookOwnership: true,
            clarity: 4,
            directness: 4,
            helpfulness: 4,
            heardImpact: 4,
            madeCustomerFeelHeard: true,
            avoidedQuestion: true,
            likelyStalled: true,
            summary: "Acknowledged the concern but did not move it forward.",
          },
        },
        {
          turn_number: 2,
          emotion_state: "concerned",
          trust_level: 3,
          issue_clarity: 4,
          employee_flags: {
            showed_empathy: true,
            answered_directly: false,
            used_correct_policy: false,
            took_ownership: true,
            avoided_question: true,
            critical_error: false,
          },
          escalation_required: false,
          scenario_risk_level: "moderate",
          continue_simulation: true,
          customer_goal: "Own The Issue And Give The Next Update",
          goal_status: "PARTIALLY_RESOLVED",
          accepted_next_step: false,
          valid_redirect: false,
          premature_closure_detected: true,
          unmet_completion_criteria: ["Customer understands the charge and next step."],
          outcome_summary: "Closure was attempted before there was a real next step.",
          patience_level: 3,
          urgency_level: 5,
          communication_style: "Direct and organized",
          cooperation_level: 4,
          offense_level: 3,
          manager_request_level: 3,
          resolution_confidence: 2,
          customer_strategy: "press_for_specifics",
          likely_next_behavior: "ask_follow_up",
          emotional_shift_explanation: "Customer is unconvinced because the employee tried to close too early.",
          conversation_stage: "resolution",
          analysis_summary: "Employee attempted to close without a real outcome.",
          latest_employee_analysis: {
            ...buildUtteranceAnalysisDefaults(),
            empathy: 7,
            warmth: 5,
            respectfulness: 6,
            professionalism: 5,
            ownership: 7,
            tookOwnership: true,
            clarity: 4,
            directness: 5,
            helpfulness: 3,
            nextStepQuality: 2,
            explanationQuality: 2,
            heardImpact: 2,
            madeCustomerFeelHeard: false,
            avoidedQuestion: true,
            explicitClosureAttempt: true,
            likelyStalled: true,
            summary: "Tried to close without explaining the actual outcome or handoff.",
          },
        },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.evaluation.category_scores.closing_control).toBeLessThanOrEqual(1);
    expect(result.evaluation.category_scores.ownership).toBeLessThanOrEqual(5);
    expect(result.evaluation.category_scores.problem_solving).toBeLessThanOrEqual(2);
    expect(result.evaluation.category_scores.listening_empathy).toBeLessThanOrEqual(5);
    expect(result.evaluation.score_dimensions.outcome_quality).toBeLessThan(50);
    expect(result.evaluation.overall_score).toBeLessThan(60);
    expect(result.evaluation.missed_moments).toContain("Tried to close the conversation before the issue was actually resolved.");
  });

  it("rewards a resolved conversation with a concrete next step", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: createScenarioFixture(),
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I can see why that is frustrating, and I am checking the account now." },
        { role: "customer", message: "Okay, what happens next?" },
        { role: "employee", message: "One charge is pending, one is final, and I am sending the correction now. You will have confirmation this afternoon." },
      ],
      stateHistory: [
        {
          turn_number: 1,
          emotion_state: "frustrated",
          trust_level: 3,
          issue_clarity: 4,
          employee_flags: {
            showed_empathy: true,
            answered_directly: true,
            used_correct_policy: true,
            took_ownership: true,
            avoided_question: false,
            critical_error: false,
          },
          escalation_required: false,
          scenario_risk_level: "moderate",
          continue_simulation: true,
          customer_goal: "Own The Issue And Give The Next Update",
          goal_status: "PARTIALLY_RESOLVED",
          accepted_next_step: false,
          valid_redirect: false,
          premature_closure_detected: false,
          unmet_completion_criteria: ["customer acknowledged next step or escalation"],
          outcome_summary: "A real next step is forming, but the customer has not accepted it yet.",
          patience_level: 4,
          urgency_level: 5,
          communication_style: "Direct and organized",
          cooperation_level: 5,
          offense_level: 2,
          manager_request_level: 2,
          resolution_confidence: 4,
          customer_strategy: "seek_clarity",
          likely_next_behavior: "ask_follow_up",
          emotional_shift_explanation: "Customer is starting to trust the explanation.",
          conversation_stage: "resolution",
          analysis_summary: "Employee explained the issue and started giving a real next step.",
          latest_employee_analysis: {
            ...buildUtteranceAnalysisDefaults(),
            empathy: 7,
            warmth: 6,
            respectfulness: 8,
            professionalism: 8,
            ownership: 8,
            tookOwnership: true,
            clarity: 7,
            directness: 7,
            helpfulness: 7,
            explanationQuality: 7,
            nextStepQuality: 7,
            heardImpact: 6,
            madeCustomerFeelHeard: true,
            answeredQuestion: true,
            explicitVerification: true,
            explicitExplanation: true,
            explicitNextStep: true,
            explicitTimeline: true,
            summary: "Employee addressed the issue and set up a concrete next step.",
          },
        },
        {
          turn_number: 2,
          emotion_state: "reassured",
          trust_level: 7,
          issue_clarity: 8,
          employee_flags: {
            showed_empathy: true,
            answered_directly: true,
            used_correct_policy: true,
            took_ownership: true,
            avoided_question: false,
            critical_error: false,
          },
          escalation_required: false,
          scenario_risk_level: "low",
          continue_simulation: false,
          customer_goal: "Own The Issue And Give The Next Update",
          goal_status: "RESOLVED",
          accepted_next_step: true,
          valid_redirect: false,
          premature_closure_detected: false,
          unmet_completion_criteria: [],
          outcome_summary: "Customer understands the issue and accepted the next step.",
          patience_level: 5,
          urgency_level: 4,
          communication_style: "Direct and organized",
          cooperation_level: 7,
          offense_level: 1,
          manager_request_level: 1,
          resolution_confidence: 8,
          customer_strategy: "close_out",
          likely_next_behavior: "close_conversation",
          emotional_shift_explanation: "Customer feels informed and knows what happens next.",
          conversation_stage: "closure",
          analysis_summary: "Employee resolved the issue with a concrete next step and timeline.",
          latest_employee_analysis: {
            ...buildUtteranceAnalysisDefaults(),
            empathy: 7,
            warmth: 6,
            respectfulness: 8,
            professionalism: 8,
            ownership: 9,
            tookOwnership: true,
            clarity: 8,
            directness: 8,
            helpfulness: 8,
            explanationQuality: 8,
            nextStepQuality: 9,
            heardImpact: 7,
            madeCustomerFeelHeard: true,
            answeredQuestion: true,
            explicitVerification: true,
            explicitExplanation: true,
            explicitNextStep: true,
            explicitTimeline: true,
            summary: "Employee resolved the issue with a clear owned next step.",
          },
        },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("completed");
    expect(result.evaluation.score_dimensions.outcome_quality).toBeGreaterThanOrEqual(85);
    expect(result.evaluation.category_scores.problem_solving).toBeGreaterThanOrEqual(7);
    expect(result.evaluation.category_scores.closing_control).toBeGreaterThanOrEqual(7);
    expect(result.evaluation.overall_score).toBeGreaterThanOrEqual(75);
  });
});

// ─── Prompt 9: Adaptive Difficulty ───

describe("simulator.adaptiveDifficulty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns difficulty recommendation based on profile", async () => {
    const mockDifficulty = {
      next_difficulty: 4,
      difficulty_reason: "Employee consistently passes level 3 scenarios. Ready for more challenge.",
      recommended_scenario_family: "emergency_response",
      recommended_emotional_intensity: "high",
      recommended_complexity: "ambiguous",
    };

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.adaptiveDifficulty({
      employeeProfile: { level_estimate: "Level 4", sessions_completed: 5 },
      recentSessions: [{ overall_score: 85 }, { overall_score: 80 }],
    }) as any;

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result.next_difficulty).toBeGreaterThanOrEqual(1);
    expect(result.next_difficulty).toBeLessThanOrEqual(5);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });
});

// ─── Save Session (requires auth) ───

describe("simulator.saveSession", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.simulator.saveSession({
        scenarioId: "WSC-TEST",
        employeeRole: "CS Team Member",
        difficulty: 3,
        mode: "in_person",
        scenarioJson: {},
        transcript: [],
      })
    ).rejects.toThrow("Please login");
  });

  it("returns sessionId null when database is not available for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.saveSession({
      scenarioId: "WSC-TEST",
      employeeRole: "CS Team Member",
      difficulty: 3,
      mode: "in_person",
      scenarioJson: {},
      transcript: [],
    });

    expect(result.success).toBe(false);
    expect(result.sessionId).toBeNull();
  });
});

// ─── Auth Tests ───

describe("auth", () => {
  it("returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.user.name).toBe("Test Employee");
    expect(result?.actorUser.name).toBe("Test Employee");
    expect(result?.impersonation).toBeNull();
  });
});
