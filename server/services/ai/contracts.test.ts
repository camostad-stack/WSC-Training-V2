import { describe, expect, it } from "vitest";

import { evaluationResultSchema, profileUpdateResultSchema } from "./contracts";

describe("evaluationResultSchema", () => {
  it("defaults the score rubric for older evaluation payloads", () => {
    const parsed = evaluationResultSchema.parse({
      overall_score: 72,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {},
      score_dimensions: {
        member_connection: 70,
        listening_discovery: 72,
        ownership_accountability: 74,
        problem_solving_policy: 75,
        clarity_expectation_setting: 73,
        resolution_control: 76,
      },
      best_moments: [],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "",
      ideal_response_example: "",
      summary: "Fallback evaluation.",
    });

    expect(parsed.score_rubric).toEqual({
      name: "WSC Member Service Interaction Rubric v1",
      summary: expect.any(String),
      dimension_order: [
        "member_connection",
        "listening_discovery",
        "ownership_accountability",
        "problem_solving_policy",
        "clarity_expectation_setting",
        "resolution_control",
      ],
      dimension_weights: {
        member_connection: 15,
        listening_discovery: 15,
        ownership_accountability: 20,
        problem_solving_policy: 20,
        clarity_expectation_setting: 15,
        resolution_control: 15,
      },
      dimension_meta: expect.any(Object),
      overall_bands: expect.any(Array),
      hard_penalties: expect.any(Array),
      competency_signals: expect.any(Array),
    });
  });

  it("rejects rubric weights that do not sum to 100", () => {
    expect(() => evaluationResultSchema.parse({
      overall_score: 72,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {},
      score_dimensions: {
        member_connection: 70,
        listening_discovery: 72,
        ownership_accountability: 74,
        problem_solving_policy: 75,
        clarity_expectation_setting: 73,
        resolution_control: 76,
      },
      score_rubric: {
        name: "Broken Rubric",
        dimension_weights: {
          member_connection: 40,
          listening_discovery: 40,
          ownership_accountability: 40,
          problem_solving_policy: 40,
          clarity_expectation_setting: 40,
          resolution_control: 40,
        },
      },
      best_moments: [],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "",
      ideal_response_example: "",
      summary: "Fallback evaluation.",
    })).toThrow(/sum to 100/i);
  });

  it("normalizes legacy score dimensions into the member-service rubric shape", () => {
    const parsed = evaluationResultSchema.parse({
      overall_score: 72,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {},
      score_dimensions: {
        interaction_quality: 70,
        operational_effectiveness: 72,
        outcome_quality: 75,
      },
      best_moments: [],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "",
      ideal_response_example: "",
      summary: "Fallback evaluation.",
    });

    expect(parsed.score_dimensions.member_connection).toBe(70);
    expect(parsed.score_dimensions.problem_solving_policy).toBe(72);
    expect(parsed.score_dimensions.resolution_control).toBe(75);
  });

  it("does not invent a zeroed scorecard when score dimensions are absent", () => {
    const parsed = evaluationResultSchema.parse({
      overall_score: 72,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {},
      best_moments: [],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "",
      ideal_response_example: "",
      summary: "Older evaluation payload without explicit score dimensions.",
    });

    expect(parsed.score_dimensions).toBeUndefined();
  });

  it("falls back cleanly from a legacy rubric payload instead of keeping a hybrid rubric", () => {
    const parsed = evaluationResultSchema.parse({
      overall_score: 72,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {},
      score_dimensions: {
        interaction_quality: 70,
        operational_effectiveness: 72,
        outcome_quality: 75,
      },
      score_rubric: {
        name: "Outcome Weighted",
        dimension_weights: {
          interaction_quality: 20,
          operational_effectiveness: 25,
          outcome_quality: 55,
        },
      },
      best_moments: [],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "",
      ideal_response_example: "",
      summary: "Legacy rubric payload.",
    });

    expect(parsed.score_rubric.name).toBe("WSC Member Service Interaction Rubric v1");
    expect(parsed.score_rubric.dimension_weights.resolution_control).toBe(15);
  });

  it("preserves richer current-shape rubric metadata", () => {
    const parsed = evaluationResultSchema.parse({
      overall_score: 72,
      pass_fail: "borderline",
      readiness_signal: "shadow_ready",
      category_scores: {},
      score_dimensions: {
        member_connection: 70,
        listening_discovery: 72,
        ownership_accountability: 74,
        problem_solving_policy: 75,
        clarity_expectation_setting: 73,
        resolution_control: 76,
      },
      score_rubric: {
        name: "Custom WSC Rubric",
        summary: "Custom summary.",
        dimension_order: [
          "member_connection",
          "listening_discovery",
          "ownership_accountability",
          "problem_solving_policy",
          "clarity_expectation_setting",
          "resolution_control",
        ],
        dimension_weights: {
          member_connection: 15,
          listening_discovery: 15,
          ownership_accountability: 20,
          problem_solving_policy: 20,
          clarity_expectation_setting: 15,
          resolution_control: 15,
        },
        dimension_meta: {
          member_connection: { label: "Custom connection", description: "desc", why_it_matters: "why" },
          listening_discovery: { label: "Listening", description: "desc", why_it_matters: "why" },
          ownership_accountability: { label: "Ownership", description: "desc", why_it_matters: "why" },
          problem_solving_policy: { label: "Judgment", description: "desc", why_it_matters: "why" },
          clarity_expectation_setting: { label: "Clarity", description: "desc", why_it_matters: "why" },
          resolution_control: { label: "Resolution", description: "desc", why_it_matters: "why" },
        },
        overall_bands: [
          { key: "custom", label: "Custom", min: 0, max: 100, summary: "Custom band." },
        ],
        hard_penalties: [
          { key: "custom_penalty", label: "Custom Penalty", description: "Custom description.", overall_cap: 42 },
        ],
        competency_signals: ["Custom competency"],
      },
      best_moments: [],
      missed_moments: [],
      critical_mistakes: [],
      coachable_mistakes: [],
      most_important_correction: "",
      ideal_response_example: "",
      summary: "Custom rubric payload.",
    });

    expect(parsed.score_rubric.dimension_meta.member_connection.label).toBe("Custom connection");
    expect(parsed.score_rubric.overall_bands[0].label).toBe("Custom");
    expect(parsed.score_rubric.hard_penalties[0].key).toBe("custom_penalty");
    expect(parsed.score_rubric.competency_signals[0]).toBe("Custom competency");
  });
});

describe("profileUpdateResultSchema", () => {
  it("accepts a longitudinal growth profile alongside practice readiness fields", () => {
    const parsed = profileUpdateResultSchema.parse({
      level_estimate: "L3",
      readiness_status: "shadow_ready",
      trend: "improving",
      skill_map: {
        empathy: 7,
        clarity: 6,
        policy_accuracy: 6,
        ownership: 7,
        de_escalation: 6,
        escalation_judgment: 6,
        professional_presence: 7,
      },
      strongest_scenario_families: ["billing_confusion"],
      weakest_scenario_families: ["reservation_issue"],
      pressure_handling: "steady",
      consistency_score: 74,
      recommended_next_steps: ["Keep building ownership through repeated sessions."],
      manager_attention_flag: false,
      longitudinal_profile: {
        framework_name: "WSC Service Growth Profile v1",
        summary: "Longitudinal profile summary.",
        stage_level: 3,
        stage_label: "Level 3 (Proficient)",
        stage_summary: "Handles common member situations independently with coachable gaps under pressure.",
        confidence: "developing",
        evidence_window_sessions: 5,
        competencies: {
          business_operations: { score: 72, trend: "up", summary: "Solid service basics are emerging." },
          drive_self_motivation: { score: 61, trend: "steady", summary: "Needs manager confirmation across time." },
          reliability_consistency: { score: 64, trend: "steady", summary: "More repetition is needed for consistency." },
          proactivity_initiative: { score: 70, trend: "up", summary: "Taking more ownership without being pulled." },
          work_ethic: { score: 62, trend: "steady", summary: "Still needs manager observation." },
          problem_solving_adaptability: { score: 69, trend: "up", summary: "Problem solving is becoming more practical." },
          community_builder: { score: 73, trend: "up", summary: "Member connection is trending well." },
        },
        development_priorities: ["Reliability & Consistency", "Work Ethic"],
        manager_observation_focus: ["Drive & Self-Motivation", "Work Ethic"],
      },
    });

    expect(parsed.longitudinal_profile.stage_level).toBe(3);
    expect(parsed.longitudinal_profile.competencies.community_builder.score).toBe(73);
  });

  it("normalizes longitudinal stage label and summary from the stage level", () => {
    const parsed = profileUpdateResultSchema.parse({
      level_estimate: "L2",
      readiness_status: "practice_more",
      trend: "flat",
      skill_map: {
        empathy: 5,
        clarity: 5,
        policy_accuracy: 5,
        ownership: 5,
        de_escalation: 5,
        escalation_judgment: 5,
        professional_presence: 5,
      },
      strongest_scenario_families: [],
      weakest_scenario_families: [],
      pressure_handling: "developing",
      consistency_score: 60,
      recommended_next_steps: [],
      manager_attention_flag: false,
      longitudinal_profile: {
        framework_name: "WSC Service Growth Profile v1",
        summary: "Longitudinal profile summary.",
        stage_level: 2,
        stage_label: "Level 7 (Leader)",
        stage_summary: "Incorrect summary.",
        confidence: "emerging",
        evidence_window_sessions: 2,
        competencies: {
          business_operations: { score: 50, trend: "steady", summary: "summary" },
          drive_self_motivation: { score: 50, trend: "steady", summary: "summary" },
          reliability_consistency: { score: 50, trend: "steady", summary: "summary" },
          proactivity_initiative: { score: 50, trend: "steady", summary: "summary" },
          work_ethic: { score: 50, trend: "steady", summary: "summary" },
          problem_solving_adaptability: { score: 50, trend: "steady", summary: "summary" },
          community_builder: { score: 50, trend: "steady", summary: "summary" },
        },
        development_priorities: [],
        manager_observation_focus: [],
      },
    });

    expect(parsed.longitudinal_profile.stage_level).toBe(2);
    expect(parsed.longitudinal_profile.stage_label).toBe("Level 2 (Novice)");
    expect(parsed.longitudinal_profile.stage_summary).toContain("Building routine competence");
  });
});
