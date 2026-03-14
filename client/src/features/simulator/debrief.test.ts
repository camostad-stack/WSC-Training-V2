import { describe, expect, it } from "vitest";
import { buildPostCallDebrief } from "./debrief";
import type { CoachingNote, EvaluationResult, ManagerDebrief, SimulationStateSnapshot } from "./types";

function makeState(overrides: Partial<SimulationStateSnapshot>): SimulationStateSnapshot {
  return {
    turn_number: 1,
    emotion_state: "frustrated",
    emotional_state: "frustrated",
    trust_level: 3,
    issue_clarity: 3,
    continue_simulation: true,
    customer_goal: "Get a clear next step",
    goal_status: "ACTIVE",
    issue_progress_state: "ACTIVE",
    terminal_outcome_state: "ACTIVE",
    terminal_validation_reason: "Conversation is still active and cannot end yet.",
    completion_blockers: ["conversation_still_active"],
    accepted_next_step: false,
    next_step_owner: "",
    next_step_timeline: "",
    valid_redirect: false,
    premature_closure_detected: false,
    unmet_completion_criteria: [],
    unresolved_questions: [],
    outcome_summary: "",
    patience_level: 5,
    urgency_level: 5,
    communication_style: "direct",
    cooperation_level: 5,
    offense_level: 3,
    manager_request_level: 2,
    resolution_confidence: 2,
    confidence_in_employee: 3,
    willingness_to_accept_redirect: 3,
    willingness_to_escalate: 4,
    customer_strategy: "seek_clarity",
    conversation_stage: "fact_finding",
    analysis_summary: "",
    latest_employee_analysis: {},
    runtime_events: [],
    ...overrides,
  };
}

const evaluation: EvaluationResult = {
  overall_score: 62,
  pass_fail: "borderline",
  readiness_signal: "practice_more",
  category_scores: {},
  score_dimensions: {
    interaction_quality: 78,
    operational_effectiveness: 54,
    outcome_quality: 32,
  },
  best_moments: ["You sounded calm under pressure."],
  missed_moments: ["You never named who would follow up or when."],
  critical_mistakes: [],
  coachable_mistakes: [],
  most_important_correction: "Give a real next step before you try to close.",
  ideal_response_example: "",
  summary: "The customer calmed down somewhat, but the issue still lacked a concrete resolution.",
};

const coaching: CoachingNote = {
  employee_coaching_summary: "You sounded calm, but the follow-up stayed too vague.",
  what_you_did_well: ["Stayed composed."],
  what_hurt_you: ["No clear next step."],
  do_this_next_time: ["Name the owner, action, and timeline."],
  replacement_phrases: [],
  practice_focus: "Concrete next steps",
  next_recommended_scenario: "billing_confusion",
};

const managerDebrief: ManagerDebrief = {
  manager_summary: "Polished tone, weak outcome.",
  performance_signal: "yellow",
  top_strengths: ["Kept the customer engaged."],
  top_corrections: ["Own the follow-up more clearly."],
  whether_live_shadowing_is_needed: false,
  whether_manager_follow_up_is_needed: true,
  recommended_follow_up_action: "Replay the close and replace it with a real next step.",
  recommended_next_drill: "cancellation_request",
};

describe("buildPostCallDebrief", () => {
  it("treats partially resolved calls as incomplete", () => {
    const history = [
      makeState({ turn_number: 1, trust_level: 3 }),
      makeState({
        turn_number: 2,
        trust_level: 4,
        terminal_outcome_state: "PARTIALLY_RESOLVED",
        issue_progress_state: "PARTIALLY_RESOLVED",
        unmet_completion_criteria: ["customer acknowledged next step or escalation"],
        unresolved_questions: ["Who is actually following up?"],
        latest_employee_analysis: {
          vaguenessDetected: true,
          explicitNextStep: false,
          explicitTimeline: false,
        },
      }),
    ];

    const result = buildPostCallDebrief({ stateHistory: history, evaluation, coaching, managerDebrief });

    expect(result.isActuallyResolved).toBe(false);
    expect(result.whyThisDidOrDidNotCountAsComplete).toContain("did not count as complete");
    expect(result.customerStillNeeded).toContain("Who is actually following up?");
  });

  it("explains invalid escalation clearly", () => {
    const history = [
      makeState({ turn_number: 1, trust_level: 4 }),
      makeState({
        turn_number: 2,
        terminal_outcome_state: "ESCALATED",
        issue_progress_state: "ESCALATED",
        accepted_next_step: false,
        valid_redirect: false,
        unmet_completion_criteria: ["customer acknowledged next step or escalation"],
      }),
    ];

    const result = buildPostCallDebrief({ stateHistory: history, evaluation, coaching, managerDebrief });

    expect(result.escalationWasValid).toBe(false);
    expect(result.whyThisDidOrDidNotCountAsComplete).toContain("did not count as a valid escalation");
  });

  it("surfaces premature closure attempts as a missed moment", () => {
    const history = [
      makeState({ turn_number: 1 }),
      makeState({
        turn_number: 2,
        premature_closure_detected: true,
        likely_next_behavior: "ask_follow_up",
        latest_employee_analysis: {
          explicitClosureAttempt: true,
        },
        runtime_events: [
          {
            type: "premature_closure_attempted",
            source: "state_manager",
            atTurn: 2,
            summary: "Employee tried to close before the complaint was settled.",
            unmetCriteria: ["customer acknowledged next step or escalation"],
            blockedBy: ["conversation_still_active"],
            prematureClosure: {
              trigger_source: "employee_wrap_up_language",
              trigger_phrase_or_reason: "That should take care of it.",
              complaint_still_open: true,
              unresolved_gaps_snapshot: ["Who is actually following up with me?"],
              trust_level_at_attempt: 3,
              emotional_state_at_attempt: "frustrated",
              blocked: true,
            },
          },
        ],
      }),
    ];

    const result = buildPostCallDebrief({ stateHistory: history, evaluation, coaching, managerDebrief });

    expect(result.prematureClosureAttempted).toBe(true);
    expect(result.missedMoments.some((moment) => moment.title === "Premature close")).toBe(true);
    expect(result.prematureClosureAttempts[0]?.trigger).toContain("take care of it");
    expect(result.prematureClosureAttempts[0]?.customerReaction).toContain("reopened");
  });

  it("flags polished but unresolved sessions", () => {
    const history = [
      makeState({ turn_number: 1, trust_level: 4 }),
      makeState({
        turn_number: 2,
        terminal_outcome_state: "ACTIVE",
        issue_progress_state: "PARTIALLY_RESOLVED",
        unresolved_questions: ["What happens next?"],
      }),
    ];

    const result = buildPostCallDebrief({ stateHistory: history, evaluation, coaching, managerDebrief });

    expect(result.polishedButUnresolved).toBe(true);
    expect(result.interactionVsOutcomeNote).toContain("polished");
  });
});
