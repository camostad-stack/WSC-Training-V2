import { describe, expect, it } from "vitest";
import { buildScenarioTemplateInsertFromScenario, inferScenarioBriefHints } from "./scenario-authoring";
import type { ScenarioDirectorResult } from "./ai/contracts";

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return {
    scenario_id: "WSC-SCENARIO-1",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 4,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Longtime member",
      communication_style: "Direct",
      initial_emotion: "frustrated",
      patience_level: "low",
    },
    situation_summary: "A member sees two charges and wants a clear answer.",
    opening_line: "Why are there two charges on my account right now?",
    hidden_facts: ["One charge is pending.", "One is finalized."],
    motive: "Get a real explanation and a usable next step.",
    hidden_context: "",
    personality_style: "Direct and detail-focused",
    past_history: "",
    pressure_context: "",
    friction_points: ["Member thinks the club ran the charge twice."],
    emotional_triggers: [],
    likely_assumptions: [],
    what_hearing_them_out_sounds_like: [],
    credible_next_steps: [],
    calm_down_if: [],
    lose_trust_if: [],
    approved_resolution_paths: ["Explain pending vs finalized and give billing follow-up with owner and timeline."],
    required_behaviors: ["Take ownership", "Answer directly"],
    critical_errors: ["Close early"],
    branch_logic: {
      if_empathy_is_strong: "Customer softens slightly.",
      if_answer_is_vague: "Customer gets sharper.",
      if_policy_is_wrong: "Customer questions competence.",
      if_employee_takes_ownership: "Customer stays engaged.",
      if_employee_fails_to_help: "Customer pushes harder.",
      if_employee_escalates_correctly: "Customer accepts the handoff.",
    },
    emotion_progression: {
      starting_state: "frustrated",
      better_if: ["Employee owns the issue."],
      worse_if: ["Employee is vague."],
    },
    completion_rules: {
      resolved_if: ["Member understands which charge is pending and accepts the next step."],
      end_early_if: [],
      manager_required_if: [],
    },
    completion_criteria: [],
    failure_criteria: [],
    recommended_turns: 7,
    ...overrides,
  };
}

describe("inferScenarioBriefHints", () => {
  it("infers customer service billing scenarios from a short brief", () => {
    const hints = inferScenarioBriefHints({
      brief: "A member thinks they were charged twice and wants a real billing answer with a clear next step.",
    });

    expect(hints.department).toBe("customer_service");
    expect(hints.scenarioFamily).toBe("billing_confusion");
    expect(hints.employeeRole).toBe("Front Desk Associate");
  });

  it("infers emergency-oriented scenarios from safety language", () => {
    const hints = inferScenarioBriefHints({
      brief: "Someone collapsed near the entry and the manager on duty needs to take control until EMS arrives.",
    });

    expect(hints.department).toBe("mod_emergency");
    expect(hints.scenarioFamily).toBe("emergency_response");
    expect(hints.difficulty).toBe(5);
  });
});

describe("buildScenarioTemplateInsertFromScenario", () => {
  it("normalizes the generated scenario into a safe template insert shape", () => {
    const template = buildScenarioTemplateInsertFromScenario({
      scenario: createScenario(),
      brief: "Member says they were billed twice and needs a real explanation.",
      createdBy: 42,
    });

    expect(template.department).toBe("customer_service");
    expect(template.scenarioFamily).toBe("billing_confusion");
    expect(template.title).toContain("billed twice");
    expect(template.recommendedTurns).toBe(5);
    expect(template.emotionalIntensity).toBe("high");
    expect(template.complexity).toBe("ambiguous");
  });
});
