import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

    mockLLMResponse(mockScenario);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.generateScenario({
      department: "customer_service",
      employeeRole: "Front Desk Associate",
      difficulty: 5,
      mode: "in_person",
    });

    expect(result.scenario).toBeDefined();
    const scenario = result.scenario as any;
    expect(scenario.scenario_id).toBe("WSC-2026-0309-IP-5A");
    expect(scenario.customer_persona.name).toBe("Karen Whitfield");
    expect(scenario.branch_logic).toBeDefined();
    expect(scenario.emotion_progression).toBeDefined();
    expect(scenario.completion_rules).toBeDefined();
    expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
  });

  it("handles LLM returning markdown-wrapped JSON", async () => {
    const mockScenario = {
      scenario_id: "WSC-TEST",
      department: "Customer Service",
      employee_role: "CS Team Member",
      difficulty: 3,
      scenario_family: "reservation_issue",
      customer_persona: {
        name: "Test Person",
        age_band: "30-40",
        membership_context: "Standard",
        communication_style: "Calm",
        initial_emotion: "concerned",
        patience_level: "moderate",
      },
      situation_summary: "Test summary",
      opening_line: "Test opening",
      hidden_facts: [],
      approved_resolution_paths: [],
      required_behaviors: [],
      critical_errors: [],
      branch_logic: {},
      emotion_progression: { starting_state: "concerned", better_if: [], worse_if: [] },
      completion_rules: { resolved_if: [], end_early_if: [], manager_required_if: [] },
      recommended_turns: 3,
    };

    mockInvokeLLM.mockResolvedValueOnce({
      id: "test-id",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "```json\n" + JSON.stringify(mockScenario) + "\n```",
          },
          finish_reason: "stop",
        },
      ],
    });

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.generateScenario({
      department: "customer_service",
      employeeRole: "CS Team Member",
      difficulty: 3,
      mode: "phone",
    });

    expect((result.scenario as any).scenario_id).toBe("WSC-TEST");
  });

  it("throws when LLM returns empty content", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      id: "test-id",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
          },
          finish_reason: "stop",
        },
      ],
    });

    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.simulator.generateScenario({
        department: "customer_service",
        employeeRole: "CS Team Member",
        difficulty: 1,
        mode: "in_person",
      })
    ).rejects.toThrow();
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

    mockLLMResponse(mockCustomerReply);
    mockLLMResponse(mockStateUpdate);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.customerReply({
      scenarioJson: { scenario_id: "test", emotion_progression: { starting_state: "frustrated" } },
      transcript: [
        { role: "customer", message: "I have a problem." },
      ],
      employeeResponse: "I'm sorry to hear that. Let me help you.",
    });

    expect(result.customerReply.customer_reply).toBe("Thank you for looking into this.");
    expect(result.customerReply.trust_level).toBe(5);
    expect(result.customerReply.director_notes.employee_showed_empathy).toBe(true);
    expect(result.stateUpdate.turn_number).toBe(1);
    expect(result.stateUpdate.employee_flags.showed_empathy).toBe(true);
    expect(result.stateUpdate.scenario_risk_level).toBe("moderate");
    expect(mockInvokeLLM).toHaveBeenCalledTimes(2);
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

    mockLLMResponse(mockCustomerReply);
    mockLLMResponse(mockStateUpdate);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.customerReply({
      scenarioJson: { scenario_id: "test" },
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "Let me fix that for you." },
        { role: "customer", message: "Okay, what can you do?" },
      ],
      employeeResponse: "I've processed your refund and here's the confirmation.",
    });

    expect(result.customerReply.scenario_complete).toBe(true);
    expect(result.customerReply.updated_emotion).toBe("relieved");
    expect(result.stateUpdate.continue_simulation).toBe(false);
  });
});

// ─── Prompt 6: Full Evaluation (includes policy grounding) ───

describe("simulator.evaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns enhanced evaluation with pass/fail and readiness", async () => {
    // 5 sequential LLM calls in runPostSessionEvaluation:
    // 1. Policy Grounding
    mockLLMResponse({
      policy_accuracy: "correct",
      matched_policy_points: ["Correct refund policy"],
      missed_policy_points: [],
      invented_or_risky_statements: [],
      should_have_escalated: false,
      policy_notes: "Good policy usage.",
    });
    // 2. Session Quality Gate
    mockLLMResponse({
      session_quality: "usable",
      flags: [],
      reason: "Session appears genuine.",
      retry_recommended: false,
    });
    // 3. Interaction Evaluator
    mockLLMResponse({
      overall_score: 82,
      pass_fail: "pass",
      readiness_signal: "floor_ready_with_support",
      category_scores: {
        opening_warmth: 8,
        listening_empathy: 9,
        clarity_directness: 8,
        policy_accuracy: 7,
        ownership: 8,
        problem_solving: 8,
        de_escalation: 9,
        escalation_judgment: 8,
        visible_professionalism: 7,
        closing_control: 8,
      },
      best_moments: ["Strong empathy in opening"],
      missed_moments: ["Could have confirmed resolution steps"],
      critical_mistakes: [],
      coachable_mistakes: ["Missed opportunity to use customer name"],
      most_important_correction: "Use the customer's name more frequently.",
      ideal_response_example: "Mrs. Whitfield, I completely understand your frustration...",
      summary: "Solid performance with strong empathy.",
    });
    // 4. Employee Coaching
    mockLLMResponse({
      employee_coaching_summary: "Good performance overall.",
      what_you_did_well: ["Strong empathy"],
      what_hurt_you: ["Missed name usage"],
      do_this_next_time: ["Use customer name early"],
      replacement_phrases: [{ original: "I understand", better: "Mrs. Whitfield, I understand" }],
      practice_focus: "Personalization",
      next_recommended_scenario: "billing_confusion",
    });
    // 5. Manager Debrief
    mockLLMResponse({
      manager_summary: "Employee showed strong empathy.",
      performance_signal: "green",
      top_strengths: ["Empathy", "Ownership"],
      top_corrections: ["Name usage"],
      whether_live_shadowing_is_needed: false,
      whether_manager_follow_up_is_needed: false,
      recommended_follow_up_action: "None needed.",
      recommended_next_drill: "billing_confusion",
    });

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: { scenario_id: "test" },
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
    expect(evaluation.overall_score).toBe(82);
    expect(evaluation.pass_fail).toBe("pass");
    expect(evaluation.readiness_signal).toBe("floor_ready_with_support");
    expect(evaluation.category_scores.opening_warmth).toBe(8);
    expect(evaluation.best_moments).toHaveLength(1);
    expect(evaluation.most_important_correction).toContain("name");
    expect(result.policyGrounding).toBeDefined();
    expect(result.coaching).toBeDefined();
    expect(result.managerDebrief).toBeDefined();
    expect(mockInvokeLLM).toHaveBeenCalledTimes(5);
  });

  it("returns a reprocess bundle for incomplete sessions", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: { scenario_id: "test" },
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "Okay." },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("reprocess");
    expect(result.failure?.code).toBe("incomplete_session");
    expect(result.sessionQuality?.retry_recommended).toBe(true);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns a reprocess bundle when a prompt returns malformed JSON", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      id: "test-id",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "{invalid-json",
          },
          finish_reason: "stop",
        },
      ],
    });

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.evaluate({
      scenarioJson: { scenario_id: "test" },
      transcript: [
        { role: "customer", message: "I have a problem." },
        { role: "employee", message: "I understand your frustration." },
        { role: "customer", message: "I was double charged." },
        { role: "employee", message: "I can verify the charge right now." },
      ],
      employeeRole: "Front Desk Associate",
    }) as any;

    expect(result.processingStatus).toBe("reprocess");
    expect(result.failure?.code).toBe("malformed_json");
    expect(result.failure?.promptName).toBe("policyGrounding");
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

    mockLLMResponse(mockDifficulty);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.simulator.adaptiveDifficulty({
      employeeProfile: { level_estimate: "Level 4", sessions_completed: 5 },
      recentSessions: [{ overall_score: 85 }, { overall_score: 80 }],
    }) as any;

    // callPrompt parses the JSON and returns the object directly
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
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
    expect(result?.name).toBe("Test Employee");
  });
});
