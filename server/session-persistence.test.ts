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
      stateHistory: [{
        turn_number: 1,
        emotion_state: "reassured",
        trust_level: 7,
        issue_clarity: 8,
        employee_flags: {},
        escalation_required: false,
        scenario_risk_level: "moderate",
        goal_status: "RESOLVED",
        issue_progress_state: "RESOLVED",
        root_issue_status: "RESOLVED",
        unresolved_subissues: [],
        terminal_outcome_state: "RESOLVED",
        accepted_next_step: true,
        valid_redirect: false,
        unmet_completion_criteria: [],
        outcome_summary: "Customer received a concrete next step and accepted the resolution.",
      }],
      evaluationResult: {
        overall_score: 84,
        pass_fail: "pass",
        readiness_signal: "partially_independent",
        category_scores: { ownership: 8 },
        score_dimensions: {
          member_connection: 78,
          listening_discovery: 80,
          ownership_accountability: 81,
          problem_solving_policy: 83,
          clarity_expectation_setting: 82,
          resolution_control: 84,
        },
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
      expect.objectContaining({
        turn_number: 1,
        emotion_state: "reassured",
        trust_level: 7,
        issue_clarity: 8,
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
        terminal_outcome_state: "RESOLVED",
        terminal_validation_reason: "Conversation reached a validated resolution.",
        completion_blockers: [],
        continue_simulation: false,
      }),
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

  it("persists abandoned sessions as abandoned even if evaluation data exists", () => {
    const values = buildSessionValues(42, {
      scenarioId: "seed-session-3",
      employeeRole: "Front Desk Associate",
      difficulty: 3,
      mode: "live_voice",
      scenarioJson: { scenario_family: "cancellation_request" },
      transcript: [
        { role: "customer", message: "I still do not know what happens next." },
        { role: "employee", message: "I can get a manager involved." },
      ],
      stateHistory: [{
        turn_number: 3,
        emotion_state: "frustrated",
        trust_level: 2,
        issue_clarity: 3,
        employee_flags: {},
        escalation_required: true,
        scenario_risk_level: "moderate",
        goal_status: "ABANDONED",
        root_issue_status: "ABANDONED",
        unresolved_subissues: ["customer acknowledged next step or escalation"],
        terminal_outcome_state: "ABANDONED",
        accepted_next_step: false,
        valid_redirect: false,
        unmet_completion_criteria: ["customer acknowledged next step or escalation"],
        outcome_summary: "Conversation ended before a valid escalation was accepted.",
      }],
      evaluationResult: {
        overall_score: 41,
        pass_fail: "fail",
        readiness_signal: "practice_more",
        category_scores: { ownership: 3 },
        score_dimensions: {
          member_connection: 44,
          listening_discovery: 38,
          ownership_accountability: 31,
          problem_solving_policy: 28,
          clarity_expectation_setting: 26,
          resolution_control: 10,
        },
      },
    });

    expect(values.status).toBe("abandoned");
    expect(values.isFlagged).toBe(true);
    expect(values.flagReason).toBe("Conversation ended before a valid escalation was accepted.");
    expect(values).not.toHaveProperty("completedAt");
  });
});
