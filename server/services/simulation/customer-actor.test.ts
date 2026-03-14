import { describe, expect, it } from "vitest";
import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";
import { simulateCustomerTurn } from "./engine";

function leadingKey(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return {
    scenario_id: "seed-billing-confusion-actor",
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
    situation_summary: "A member sees two charges on their account and wants a clear explanation and next step.",
    opening_line: "I need to know why I was charged twice and what happens next.",
    hidden_facts: ["One charge is pending and one charge is final."],
    approved_resolution_paths: ["Verify the ledger, explain the charges, and give a concrete next step with a timeline."],
    required_behaviors: ["Answer directly", "Take ownership", "Give a real next step"],
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

function runTurn(params: {
  scenario?: ScenarioDirectorResult;
  transcript?: TranscriptTurn[];
  priorState?: unknown;
  employeeResponse: string;
}) {
  return simulateCustomerTurn({
    scenario: params.scenario || createScenario(),
    transcript: params.transcript || [{ role: "customer", message: "I need to know why I was charged twice." }],
    priorState: params.priorState as any,
    employeeResponse: params.employeeResponse,
  });
}

describe("customer actor runtime", () => {
  it("pushes back on empathetic but vague employees without sounding like a bot", () => {
    const result = runTurn({
      employeeResponse: "I totally understand why that feels frustrating, and we really appreciate your patience while we look into this.",
    });

    const reply = result.customerReply.customer_reply.toLowerCase();

    expect(["ACTIVE", "PARTIALLY_RESOLVED"]).toContain(result.stateUpdate.goal_status);
    expect(reply).toMatch(/what|actually|still|vague|doing/);
    expect(reply).not.toContain("thank you for clarifying");
    expect(reply).not.toContain("i understand your frustration");
    expect(reply).not.toContain("i appreciate your patience");
    expect(reply.length).toBeLessThan(180);
  });

  it("softens when the employee is direct and competent", () => {
    const strong = runTurn({
      employeeResponse: "I am checking the ledger now. One charge looks pending, one looks final, and I will confirm which is which before I give you the next step.",
    });
    const vague = runTurn({
      employeeResponse: "We will look into it and get back to you.",
    });

    const reply = strong.customerReply.customer_reply.toLowerCase();

    expect(strong.stateUpdate.trust_level).toBeGreaterThan(vague.stateUpdate.trust_level);
    expect(reply).toMatch(/okay|all right|better|clearer|what happens next|what exactly/);
    expect(reply).not.toMatch(/manager|talk to me like that/);
    expect(reply).not.toContain("thank you");
  });

  it("treats scripted or robotic language as less trustworthy", () => {
    const result = runTurn({
      employeeResponse: "I understand your frustration and appreciate your patience while I assist you with this matter and work toward a resolution.",
    });

    const reply = result.customerReply.customer_reply.toLowerCase();

    expect(result.stateUpdate.latest_employee_analysis.roboticPhrasing).toBe(true);
    expect(result.stateUpdate.trust_level).toBeLessThanOrEqual(3);
    expect(reply).toMatch(/concrete|real answer|what actually|what are you checking|brush-off/);
    expect(reply).not.toContain("assist");
  });

  it("calls out dismissive treatment like a real customer would", () => {
    const result = runTurn({
      employeeResponse: "That is just the policy. You will need to deal with it.",
    });

    const reply = result.customerReply.customer_reply.toLowerCase();

    expect(result.stateUpdate.offense_level).toBeGreaterThanOrEqual(5);
    expect(reply).toMatch(/tone|manager|not okay|talk to me/);
    expect(reply.split(" ").length).toBeLessThan(30);
  });

  it("reopens the issue when the employee closes early", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I understand why that would be frustrating." },
        { role: "customer", message: "Okay, but what happens next?" },
      ],
      employeeResponse: "That should take care of it. You are all set.",
    });

    const reply = result.customerReply.customer_reply.toLowerCase();

    expect(result.stateUpdate.premature_closure_detected).toBe(true);
    expect(result.stateUpdate.goal_status).toBe("ACTIVE");
    expect(reply).toMatch(/not done|still|what happens next|who|wait/);
    expect(result.stateUpdate.runtime_events.some((event) => event.type === "premature_closure_attempted")).toBe(true);
  });

  it("stays engaged through multiple unresolved turns instead of winding down on its own", () => {
    const firstTurn = runTurn({
      employeeResponse: "We are looking into it.",
    });

    const secondTurn = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "We are looking into it." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.stateUpdate.emotion_state },
      ],
      priorState: firstTurn.stateUpdate,
      employeeResponse: "Someone will follow up.",
    });

    const thirdTurn = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "We are looking into it." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.stateUpdate.emotion_state },
        { role: "employee", message: "Someone will follow up." },
        { role: "customer", message: secondTurn.customerReply.customer_reply, emotion: secondTurn.stateUpdate.emotion_state },
      ],
      priorState: secondTurn.stateUpdate,
      employeeResponse: "We still need a little more time on this.",
    });

    const reply = thirdTurn.customerReply.customer_reply.toLowerCase();
    const firstReply = firstTurn.customerReply.customer_reply.toLowerCase();
    const secondReply = secondTurn.customerReply.customer_reply.toLowerCase();

    expect(thirdTurn.stateUpdate.unmet_completion_criteria.length).toBeGreaterThan(0);
    expect(thirdTurn.stateUpdate.terminal_outcome_state).toBe("ACTIVE");
    expect(reply).toMatch(/who|when|still|what happens next|time|update/);
    expect(reply).not.toMatch(/have a good day|thanks for your help|that works for me/);
    expect(reply).not.toBe(firstReply);
    expect(reply).not.toBe(secondReply);
    expect(leadingKey(firstReply)).not.toBe(leadingKey(secondReply));
    expect(leadingKey(secondReply)).not.toBe(leadingKey(reply));
  });

  it("can recover after losing trust when the employee becomes concrete and accountable", () => {
    const firstTurn = runTurn({
      employeeResponse: "Calm down. We already told you we would look at it.",
    });

    const secondTurn = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "Calm down. We already told you we would look at it." },
        { role: "customer", message: firstTurn.customerReply.customer_reply, emotion: firstTurn.stateUpdate.emotion_state },
      ],
      priorState: firstTurn.stateUpdate,
      employeeResponse: "You are right to ask. I am checking the charge now, I own the follow-up, and I will confirm the exact next step with you before you leave.",
    });

    const reply = secondTurn.customerReply.customer_reply.toLowerCase();

    expect(firstTurn.stateUpdate.trust_level).toBeLessThanOrEqual(2);
    expect(secondTurn.stateUpdate.trust_level).toBeGreaterThan(firstTurn.stateUpdate.trust_level);
    expect(reply).not.toMatch(/talk to me like that|manager now/);
    expect(reply).toMatch(/okay|all right|better|clearer|who exactly|what happens next/);
    expect(secondTurn.stateUpdate.latest_employee_analysis.tookOwnership).toBe(true);
  });

  it("keeps stronger resolutions ordinary instead of slipping into support-bot phrasing", () => {
    const result = runTurn({
      transcript: [
        { role: "customer", message: "I need to know why I was charged twice." },
        { role: "employee", message: "I'm checking the ledger now." },
        { role: "customer", message: "Okay, but what's actually happening?" },
      ],
      employeeResponse: "One charge is pending, one is final, and I'm sending the correction now. I own it, and you'll get confirmation this afternoon.",
    });

    const reply = result.customerReply.customer_reply.toLowerCase();

    expect(result.stateUpdate.terminal_outcome_state).toBe("RESOLVED");
    expect(reply).not.toContain("thank you for clarifying");
    expect(reply).not.toContain("i appreciate your patience");
    expect(reply).not.toContain("that sounds great");
    expect(reply.split(" ").length).toBeLessThan(20);
  });
});
