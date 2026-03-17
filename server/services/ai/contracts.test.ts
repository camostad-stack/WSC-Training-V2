import { describe, expect, it } from "vitest";

import { evaluationResultSchema } from "./contracts";

describe("evaluationResultSchema", () => {
  it("defaults the score rubric for older evaluation payloads", () => {
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

    expect(parsed.score_rubric).toEqual({
      name: "Outcome Weighted",
      dimension_weights: {
        interaction_quality: 20,
        operational_effectiveness: 25,
        outcome_quality: 55,
      },
    });
  });

  it("rejects rubric weights that do not sum to 100", () => {
    expect(() => evaluationResultSchema.parse({
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
        name: "Broken Rubric",
        dimension_weights: {
          interaction_quality: 40,
          operational_effectiveness: 40,
          outcome_quality: 40,
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
});
