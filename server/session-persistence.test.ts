import { describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { buildSessionValues } from "./services/session-persistence";

describe("buildSessionValues", () => {
  it("derives persisted score fields from evaluation output", () => {
    const values = buildSessionValues(42, {
      scenarioId: "seed-session-1",
      employeeRole: "Front Desk Associate",
      difficulty: 3,
      mode: "in_person",
      scenarioJson: { scenario_family: "billing_confusion" },
      transcript: [
        { role: "customer", message: "Need help" },
        { role: "employee", message: "I can help with that." },
      ],
      stateHistory: [{ turn_number: 1, emotion_state: "frustrated", trust_level: 3, issue_clarity: 5, employee_flags: {}, escalation_required: false, scenario_risk_level: "moderate" }],
      evaluationResult: {
        overall_score: 84,
        pass_fail: "pass",
        readiness_signal: "partially_independent",
        category_scores: { ownership: 8 },
      },
      coachingResult: { practice_focus: "closing_control" },
    });

    expect(values.userId).toBe(42);
    expect(values.status).toBe("completed");
    expect(values.turnCount).toBe(2);
    expect(values.transcript).toEqual([
      { role: "customer", message: "Need help" },
      { role: "employee", message: "I can help with that." },
    ]);
    expect(values.stateHistory).toEqual([
      {
        turn_number: 1,
        emotion_state: "frustrated",
        trust_level: 3,
        issue_clarity: 5,
        employee_flags: {
          showed_empathy: false,
          answered_directly: false,
          used_correct_policy: false,
          took_ownership: false,
          avoided_question: false,
          critical_error: false,
        },
        escalation_required: false,
        scenario_risk_level: "moderate",
        continue_simulation: true,
      },
    ]);
    expect(values.overallScore).toBe(84);
    expect(values.passFail).toBe("pass");
    expect(values.readinessSignal).toBe("partially_independent");
    expect(values.categoryScores).toEqual({ ownership: 8 });
    expect(values.completedAt).toBeInstanceOf(Date);
  });

  it("does not persist fake readiness defaults for in-progress sessions", () => {
    const values = buildSessionValues(42, {
      scenarioId: "seed-session-2",
      employeeRole: "Front Desk Associate",
      difficulty: 2,
      mode: "phone",
      scenarioJson: { scenario_family: "reservation_issue" },
      transcript: { unexpected: true },
      stateHistory: { unexpected: true },
    });

    expect(values.status).toBe("in_progress");
    expect(values.transcript).toEqual([]);
    expect(values.stateHistory).toEqual([]);
    expect(values.turnCount).toBe(0);
    expect(values).not.toHaveProperty("overallScore");
    expect(values).not.toHaveProperty("passFail");
    expect(values).not.toHaveProperty("readinessSignal");
    expect(values).not.toHaveProperty("completedAt");
  });
});
