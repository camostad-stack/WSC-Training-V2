import { describe, expect, it } from "vitest";
import { simulateCustomerTurn } from "./engine";
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

function runTurn(params: {
  scenario?: ScenarioDirectorResult;
  transcript?: TranscriptTurn[];
  employeeResponse: string;
  priorState?: unknown;
  deliveryAnalysis?: {
    pacing?: { hesitationRisk?: "low" | "medium" | "high" };
    delivery?: {
      rushedRisk?: "low" | "medium" | "high";
      fragmentationRisk?: "low" | "medium" | "high";
      pacingStabilityRisk?: "low" | "medium" | "high";
      sharpnessRisk?: "low" | "medium" | "high";
      interruptionRisk?: "low" | "medium" | "high";
      loudnessConsistency?: "stable" | "variable" | "erratic";
      intensity?: "low" | "moderate" | "high";
    };
    coachingSignals?: string[];
  };
}) {
  return simulateCustomerTurn({
    scenario: params.scenario || createScenario(),
    transcript: params.transcript || [{ role: "customer", message: "I need to know why I was charged twice." }],
    employeeResponse: params.employeeResponse,
    priorState: params.priorState as any,
    deliveryAnalysis: params.deliveryAnalysis,
  });
}

function runSequence(params: {
  scenario?: ScenarioDirectorResult;
  employeeResponses: string[];
}) {
  const scenario = params.scenario || createScenario();
  let priorState: unknown = undefined;
  const transcript: TranscriptTurn[] = [{ role: "customer", message: scenario.opening_line }];
  const results = [];

  for (const response of params.employeeResponses) {
    const result = runTurn({
      scenario,
      transcript,
      priorState,
      employeeResponse: response,
    });
    results.push(result);
    transcript.push({ role: "employee", message: response });
    transcript.push({
      role: "customer",
      message: result.customerReply.customer_reply,
      emotion: result.stateUpdate.emotion_state,
    });
    priorState = result.stateUpdate;
  }

  return {
    scenario,
    results,
    final: results[results.length - 1],
    transcript,
  };
}

describe("simulation engine", () => {
  it("reacts differently to respectful ownership than to vague reassurance", () => {
    const strong = runTurn({
      employeeResponse: "I can see why that would be frustrating. I am pulling up your ledger now so I can verify which charge is pending and which one is final.",
    });
    const vague = runTurn({
      employeeResponse: "I understand. We will look into it and get back to you.",
    });

    expect(strong.stateUpdate.trust_level).toBeGreaterThan(vague.stateUpdate.trust_level);
    expect(strong.customerReply.customer_reply.toLowerCase()).toMatch(/next concrete step|what exactly happens next/);
    expect(vague.customerReply.customer_reply.toLowerCase()).toMatch(/actual next step|what happens next|real answer/);
  });

  it("becomes offended and seeks a manager when the employee is disrespectful", () => {
    const result = runTurn({
      employeeResponse: "Calm down. That's not my problem and you'll need to talk to someone else.",
    });

    expect(result.stateUpdate.offense_level).toBeGreaterThanOrEqual(6);
    expect(result.stateUpdate.manager_request_level).toBeGreaterThanOrEqual(6);
    expect(result.customerReply.customer_reply.toLowerCase()).toMatch(/manager|talking to me like that/);
  });

  it("pushes golf conversations toward discovery before recommendation", () => {
    const result = runTurn({
      scenario: createScenario({
        department: "golf",
        employee_role: "Golf Sales-Service Associate",
        scenario_family: "hesitant_prospect",
        customer_persona: {
          name: "Liam Hart",
          age_band: "35-45",
          membership_context: "Prospect comparing multiple clubs",
          communication_style: "curious and comparison-driven",
          initial_emotion: "skeptical",
          patience_level: "moderate",
        },
        opening_line: "I'm not sure this is worth it for me.",
      }),
      transcript: [{ role: "customer", message: "I'm not sure this is worth it for me." }],
      employeeResponse: "We have a premium club with a lot of value and I think you'd love it.",
    });

    expect(result.customerReply.customer_reply.toLowerCase()).toMatch(/ask what i am actually looking for|before pitching me/);
    expect(result.stateUpdate.goal_status).toBe("ACTIVE");
  });

  it("prioritizes control and direction in emergency scenarios", () => {
    const result = runTurn({
      scenario: createScenario({
        department: "mod_emergency",
        employee_role: "Manager on Duty",
        scenario_family: "emergency_response",
        customer_persona: {
          name: "Alicia Gomez",
          age_band: "30-40",
          membership_context: "Witness to an urgent incident",
          communication_style: "alarmed and urgent",
          initial_emotion: "alarmed",
          patience_level: "low",
        },
        opening_line: "Someone collapsed near cardio.",
      }),
      transcript: [{ role: "customer", message: "Someone collapsed near cardio." }],
      employeeResponse: "I am activating emergency response now and taking control of this.",
    });

    expect(result.customerReply.customer_reply.toLowerCase()).toContain("what do you need");
    expect(result.stateUpdate.customer_strategy).toBe("seek_action");
    expect(result.stateUpdate.urgency_level).toBeGreaterThanOrEqual(8);
  });

  it("closes once the employee resolves the missing objectives cleanly", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "I need to know why I was charged twice." },
      { role: "employee", message: "I can see why that would be frustrating, and I am taking ownership of this." },
      { role: "customer", message: "What are you checking or confirming right now?", emotion: "concerned" },
      { role: "employee", message: "I am pulling up the ledger now to verify which charge is pending and which one is final." },
      { role: "customer", message: "What exactly happens next from here?", emotion: "calmer" },
    ];
    const result = runTurn({
      transcript,
      employeeResponse: "The final charge is your active membership, the other one is still pending, and I am sending the correction now. You will have the confirmation this afternoon.",
    });

    expect(result.stateUpdate.goal_status).toBe("RESOLVED");
    expect(result.stateUpdate.continue_simulation).toBe(false);
    expect(result.stateUpdate.root_issue_status).toBe("RESOLVED");
    expect(result.customerReply.customer_reply.toLowerCase()).toMatch(/what happens next|next step|clearer/);
  });

  it("lets a simple issue end quickly when the answer is correct and concrete", () => {
    const result = runTurn({
      scenario: createScenario({
        scenario_family: "membership_question",
        opening_line: "Do I have access to the pool with my membership right now?",
        hidden_facts: ["The member's current plan includes pool access."],
        completion_criteria: [
          "customer clearly understands the access status",
        ],
      }),
      transcript: [{ role: "customer", message: "Do I have access to the pool with my membership right now?" }],
      employeeResponse: "Yes. Your current membership includes pool access, and you can use it today. If the front desk scanner gives you any trouble, I will fix it here with you right now.",
    });

    expect(result.stateUpdate.terminal_outcome_state).toBe("RESOLVED");
    expect(result.stateUpdate.continue_simulation).toBe(false);
  });

  it("flags premature closure without ending the conversation", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I understand why that would be frustrating." },
        { role: "customer", message: "Okay, but what actually happens next?" },
      ],
      employeeResponse: "That should take care of it. You are all set.",
    });

    expect(result.stateUpdate.premature_closure_detected).toBe(true);
    expect(result.stateUpdate.goal_status).toBe("ACTIVE");
    expect(result.stateUpdate.continue_simulation).toBe(true);
    expect(result.stateUpdate.runtime_events.some((event) => event.type === "premature_closure_attempted")).toBe(true);
    expect(result.stateUpdate.runtime_events.some((event) => event.type === "unresolved_complaint_persists")).toBe(true);
    const prematureEvent = result.stateUpdate.runtime_events.find((event) => event.type === "premature_closure_attempted");
    expect(prematureEvent?.prematureClosure?.trigger_source).toBe("employee_wrap_up_language");
    expect(prematureEvent?.prematureClosure?.blocked).toBe(true);
    expect(prematureEvent?.prematureClosure?.unresolved_gaps_snapshot.length).toBeGreaterThan(0);
    expect(result.customerReply.scenario_complete).toBe(false);
  });

  it("blocks vague reassurance plus wrap-up even when it sounds polite", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I am checking that now." },
        { role: "customer", message: "Okay, but what happens next for me?" },
      ],
      employeeResponse: "Someone will follow up soon, so that should take care of it.",
    });

    expect(result.stateUpdate.premature_closure_detected).toBe(true);
    expect(result.stateUpdate.continue_simulation).toBe(true);
    const prematureEvent = result.stateUpdate.runtime_events.find((event) => event.type === "premature_closure_attempted");
    expect(prematureEvent?.prematureClosure?.trigger_phrase_or_reason.toLowerCase()).toContain("someone will follow up");
  });

  it("blocks accepted next steps that still have timeline gaps", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I am checking the charge now." },
        { role: "customer", message: "What exactly happens next?" },
      ],
      employeeResponse: "I will own the follow-up and send the correction, so you should be all set.",
    });

    expect(result.stateUpdate.continue_simulation).toBe(true);
    expect(result.stateUpdate.next_step_missing_fields).toContain("timeline");
    const prematureEvent = result.stateUpdate.runtime_events.find((event) => event.type === "premature_closure_attempted");
    expect(prematureEvent?.prematureClosure?.blocked).toBe(true);
  });

  it("pushes the customer harder when delivery sounds rushed and fragmented even if the words are decent", () => {
    const steady = runTurn({
      employeeResponse: "I can see why that would be frustrating. I am checking that now and I will update you this afternoon.",
    });
    const rushed = runTurn({
      employeeResponse: "I can see why that would be frustrating. I am checking that now and I will update you this afternoon.",
      deliveryAnalysis: {
        pacing: { hesitationRisk: "medium" },
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
    });

    expect(rushed.stateUpdate.trust_level).toBeLessThan(steady.stateUpdate.trust_level);
    expect(rushed.stateUpdate.latest_employee_analysis.clarity).toBeLessThan(steady.stateUpdate.latest_employee_analysis.clarity);
  });

  it("does not end on escalation language alone without a concrete handoff", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need a manager at this point." },
      ],
      employeeResponse: "I can get a manager involved.",
    });

    expect(result.stateUpdate.goal_status).toBe("ACTIVE");
    expect(result.stateUpdate.valid_redirect).toBe(false);
    expect(result.stateUpdate.continue_simulation).toBe(true);
    expect(result.stateUpdate.escalation_validity).toBe("potential");
    expect(result.customerReply.scenario_complete).toBe(false);
  });

  it("keeps the billing complaint open when the employee answers the follow-up but not the core charge issue", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I am checking that now." },
        { role: "customer", message: "Fine, but who is actually following up with me?" },
      ],
      employeeResponse: "I will own the update and email you later today.",
    });

    expect(result.stateUpdate.complaint_category).toBe("billing");
    expect(result.stateUpdate.complaint_still_open).toBe(true);
    expect(result.stateUpdate.goal_status).not.toBe("RESOLVED");
    expect(result.stateUpdate.subissues_open.join(" ")).toMatch(/charge|billing/);
  });

  it("keeps cancellation complaints open when escalation is mentioned without a concrete owner and timeline", () => {
    const result = runTurn({
      scenario: createScenario({
        scenario_family: "cancellation_request",
        opening_line: "I need to know whether my cancellation is actually in place.",
        hidden_facts: ["The cancellation request exists, but it has not been processed yet."],
        completion_criteria: [
          "current cancellation status is clear",
          "customer knows the exact next cancellation action",
          "owner and timeline are clear before closing",
        ],
      }),
      transcript: [{ role: "customer", message: "I need to know whether my cancellation is actually in place." }],
      employeeResponse: "I can get a manager involved if you want.",
    });

    expect(result.stateUpdate.complaint_category).toBe("cancellation");
    expect(result.stateUpdate.goal_status).not.toBe("ESCALATED");
    expect(result.stateUpdate.continue_simulation).toBe(true);
    expect(result.stateUpdate.escalation_validity).toBe("potential");
    expect(result.stateUpdate.complaint_still_open).toBe(true);
  });

  it("closes a cancellation complaint only when the escalation path is concrete and accepted", () => {
    const result = runTurn({
      scenario: createScenario({
        scenario_family: "cancellation_request",
        opening_line: "I need to know whether my cancellation is actually in place.",
        hidden_facts: ["The cancellation request exists, but it has not been processed yet."],
        completion_criteria: [
          "current cancellation status is clear",
          "customer knows the exact next cancellation action",
          "owner and timeline are clear before closing",
        ],
      }),
      transcript: [{ role: "customer", message: "I need to know whether my cancellation is actually in place." }],
      employeeResponse: "Your cancellation request is still pending, so I am getting the membership manager now, they will review it within 15 minutes, and I will stay on this until they take over.",
    });

    expect(result.stateUpdate.goal_status).toBe("ESCALATED");
    expect(result.stateUpdate.valid_redirect).toBe(true);
    expect(result.stateUpdate.escalation_validity).toBe("valid");
    expect(result.stateUpdate.continue_simulation).toBe(false);
  });

  it("keeps a polished but unresolved conversation open across multiple turns", () => {
    const transcript: TranscriptTurn[] = [
      { role: "customer", message: "I need to know why I was charged twice." },
      { role: "employee", message: "I understand why that would be frustrating and I appreciate your patience." },
      { role: "customer", message: "Okay, but what happens next?" },
      { role: "employee", message: "We are looking into it and will follow up." },
      { role: "customer", message: "Who is following up with me?" },
    ];

    const result = runTurn({
      transcript,
      employeeResponse: "I know this is frustrating. We will keep an eye on it for you.",
    });

    expect(result.stateUpdate.continue_simulation).toBe(true);
    expect(result.stateUpdate.root_issue_status).not.toBe("RESOLVED");
    expect(result.stateUpdate.unresolved_subissues.length).toBeGreaterThan(0);
  });

  it("keeps a complex complaint alive across a longer back-and-forth when progress is partial", () => {
    const sequence = runSequence({
      scenario: createScenario({
        scenario_family: "reservation_issue",
        opening_line: "My reservation disappeared, I was charged, and no one can tell me what happens now.",
        hidden_facts: [
          "The reservation was moved during a system sync.",
          "The original charge is still authorized but not settled.",
          "A manager can manually rebuild the booking if the slot is still open.",
        ],
        completion_criteria: [
          "reservation status is explained clearly",
          "charge status is explained clearly",
          "customer knows the exact recovery or escalation path",
        ],
        recommended_turns: 2,
      }),
      employeeResponses: [
        "I am checking the reservation system now so I can see what moved.",
        "I found that the booking shifted during a sync, but I still need to confirm the charge status.",
        "The charge is still only authorized, not settled, and I am getting the manager who can rebuild the booking if the slot is open.",
        "They are checking the slot now and I will stay with this until we know whether it can be restored today.",
      ],
    });

    expect(sequence.final.stateUpdate.turn_number).toBe(4);
    expect(sequence.final.stateUpdate.continue_simulation).toBe(true);
    expect(sequence.final.stateUpdate.terminal_outcome_state).not.toBe("RESOLVED");
    expect(sequence.final.stateUpdate.issue_complexity).toBeGreaterThanOrEqual(6);
    expect(sequence.final.stateUpdate.no_progress_turns).toBeLessThanOrEqual(1);
  });

  it("extends the conversation when repeated vague answers keep the complaint open", () => {
    const sequence = runSequence({
      employeeResponses: [
        "We are looking into it.",
        "Someone will follow up.",
        "We still need more time on this.",
      ],
    });

    expect(sequence.final.stateUpdate.continue_simulation).toBe(true);
    expect(sequence.final.stateUpdate.no_progress_turns).toBeGreaterThanOrEqual(2);
    expect(sequence.final.stateUpdate.follow_up_question_count).toBeGreaterThanOrEqual(2);
    expect(sequence.final.stateUpdate.resolution_momentum).toBeLessThanOrEqual(3);
  });

  it("does not end just because the conversation went longer than a soft recommended length", () => {
    const sequence = runSequence({
      scenario: createScenario({
        recommended_turns: 2,
      }),
      employeeResponses: [
        "I am checking that now.",
        "We are still reviewing it.",
        "Someone will follow up soon.",
        "I know it is frustrating, but we are still looking into it.",
      ],
    });

    expect(sequence.final.stateUpdate.turn_number).toBe(4);
    expect(sequence.final.stateUpdate.continue_simulation).toBe(true);
    expect(sequence.final.customerReply.scenario_complete).toBe(false);
  });

  it("turns repeated no-progress loops into an explicit timeout failure instead of fake completion", () => {
    const sequence = runSequence({
      scenario: createScenario({
        scenario_family: "membership_question",
        opening_line: "Do I have access to the pool with my membership right now?",
        hidden_facts: ["The member's current plan includes pool access."],
        completion_criteria: ["customer clearly understands the access status"],
      }),
      employeeResponses: [
        "We are looking into it.",
        "We are still looking into it.",
        "Someone will follow up.",
        "We still need more time.",
        "We are looking into it.",
      ],
    });

    expect(sequence.final.stateUpdate.terminal_outcome_state).toBe("TIMED_OUT");
    expect(sequence.final.stateUpdate.continue_simulation).toBe(false);
    expect(sequence.final.stateUpdate.runtime_events.some((event) => event.type === "timeout_failure")).toBe(true);
    expect(sequence.final.customerReply.scenario_complete).toBe(true);
    expect(sequence.final.customerReply.completion_reason).toBe("timed_out");
  });

  it("logs multiple premature closure attempts across one unresolved conversation", () => {
    const firstTurn = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
      ],
      employeeResponse: "Someone will follow up soon, so that should take care of it.",
    });

    const secondTurn = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "Someone will follow up soon, so that should take care of it." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.stateUpdate.emotion_state },
      ],
      priorState: firstTurn.stateUpdate,
      employeeResponse: "Okay, have a great day.",
    });

    const prematureEvents = secondTurn.stateUpdate.runtime_events.filter((event) => event.type === "premature_closure_attempted");
    expect(prematureEvents).toHaveLength(2);
    expect(secondTurn.stateUpdate.continue_simulation).toBe(true);
  });

  it("uses the same terminal validator on the customer reply and state update", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need a clear answer on the charge." },
        { role: "employee", message: "I am checking the ledger now and confirming which charge is pending." },
        { role: "customer", message: "Okay, so what happens next for me?" },
      ],
      employeeResponse: "The pending charge is being reversed now, I own the follow-up, and you will have the email confirmation within 15 minutes.",
    });

    expect(result.customerReply.scenario_complete).toBe(result.stateUpdate.continue_simulation === false);
  });
});
