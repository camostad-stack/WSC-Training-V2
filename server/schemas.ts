/**
 * JSON schemas for structured LLM responses — all 10 prompts.
 */

export const scenarioDirectorSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "scenario_director",
    strict: true,
    schema: {
      type: "object",
      properties: {
        scenario_id: { type: "string" },
        department: { type: "string" },
        employee_role: { type: "string" },
        difficulty: { type: "integer" },
        scenario_family: { type: "string" },
        customer_persona: {
          type: "object",
          properties: {
            name: { type: "string" },
            age_band: { type: "string" },
            membership_context: { type: "string" },
            communication_style: { type: "string" },
            initial_emotion: { type: "string" },
            patience_level: { type: "string" },
          },
          required: ["name", "age_band", "membership_context", "communication_style", "initial_emotion", "patience_level"],
          additionalProperties: false,
        },
        situation_summary: { type: "string" },
        opening_line: { type: "string" },
        hidden_facts: { type: "array", items: { type: "string" } },
        approved_resolution_paths: { type: "array", items: { type: "string" } },
        required_behaviors: { type: "array", items: { type: "string" } },
        critical_errors: { type: "array", items: { type: "string" } },
        branch_logic: {
          type: "object",
          properties: {
            if_empathy_is_strong: { type: "string" },
            if_answer_is_vague: { type: "string" },
            if_policy_is_wrong: { type: "string" },
            if_employee_takes_ownership: { type: "string" },
            if_employee_fails_to_help: { type: "string" },
            if_employee_escalates_correctly: { type: "string" },
          },
          required: ["if_empathy_is_strong", "if_answer_is_vague", "if_policy_is_wrong", "if_employee_takes_ownership", "if_employee_fails_to_help", "if_employee_escalates_correctly"],
          additionalProperties: false,
        },
        emotion_progression: {
          type: "object",
          properties: {
            starting_state: { type: "string" },
            better_if: { type: "array", items: { type: "string" } },
            worse_if: { type: "array", items: { type: "string" } },
          },
          required: ["starting_state", "better_if", "worse_if"],
          additionalProperties: false,
        },
        completion_rules: {
          type: "object",
          properties: {
            resolved_if: { type: "array", items: { type: "string" } },
            end_early_if: { type: "array", items: { type: "string" } },
            manager_required_if: { type: "array", items: { type: "string" } },
          },
          required: ["resolved_if", "end_early_if", "manager_required_if"],
          additionalProperties: false,
        },
        recommended_turns: { type: "integer" },
      },
      required: [
        "scenario_id", "department", "employee_role", "difficulty", "scenario_family",
        "customer_persona", "situation_summary", "opening_line", "hidden_facts",
        "approved_resolution_paths", "required_behaviors", "critical_errors",
        "branch_logic", "emotion_progression", "completion_rules", "recommended_turns"
      ],
      additionalProperties: false,
    },
  },
};

export const customerReplySchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "customer_reply",
    strict: true,
    schema: {
      type: "object",
      properties: {
        customer_reply: { type: "string" },
        updated_emotion: { type: "string" },
        trust_level: { type: "integer" },
        issue_clarity: { type: "integer" },
        manager_needed: { type: "boolean" },
        scenario_complete: { type: "boolean" },
        completion_reason: { type: "string" },
        new_hidden_fact_revealed: { type: "string" },
        director_notes: {
          type: "object",
          properties: {
            employee_showed_empathy: { type: "boolean" },
            employee_was_clear: { type: "boolean" },
            employee_used_correct_policy: { type: "boolean" },
            employee_took_ownership: { type: "boolean" },
            employee_should_be_pushed_harder: { type: "boolean" },
          },
          required: ["employee_showed_empathy", "employee_was_clear", "employee_used_correct_policy", "employee_took_ownership", "employee_should_be_pushed_harder"],
          additionalProperties: false,
        },
      },
      required: ["customer_reply", "updated_emotion", "trust_level", "issue_clarity", "manager_needed", "scenario_complete", "completion_reason", "new_hidden_fact_revealed", "director_notes"],
      additionalProperties: false,
    },
  },
};

export const stateManagerSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "conversation_state",
    strict: true,
    schema: {
      type: "object",
      properties: {
        turn_number: { type: "integer" },
        emotion_state: { type: "string" },
        trust_level: { type: "integer" },
        issue_clarity: { type: "integer" },
        employee_flags: {
          type: "object",
          properties: {
            showed_empathy: { type: "boolean" },
            answered_directly: { type: "boolean" },
            used_correct_policy: { type: "boolean" },
            took_ownership: { type: "boolean" },
            avoided_question: { type: "boolean" },
            critical_error: { type: "boolean" },
          },
          required: ["showed_empathy", "answered_directly", "used_correct_policy", "took_ownership", "avoided_question", "critical_error"],
          additionalProperties: false,
        },
        escalation_required: { type: "boolean" },
        scenario_risk_level: { type: "string" },
        continue_simulation: { type: "boolean" },
      },
      required: ["turn_number", "emotion_state", "trust_level", "issue_clarity", "employee_flags", "escalation_required", "scenario_risk_level", "continue_simulation"],
      additionalProperties: false,
    },
  },
};

export const policyGroundingSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "policy_grounding",
    strict: true,
    schema: {
      type: "object",
      properties: {
        policy_accuracy: { type: "string" },
        matched_policy_points: { type: "array", items: { type: "string" } },
        missed_policy_points: { type: "array", items: { type: "string" } },
        invented_or_risky_statements: { type: "array", items: { type: "string" } },
        should_have_escalated: { type: "boolean" },
        policy_notes: { type: "string" },
      },
      required: ["policy_accuracy", "matched_policy_points", "missed_policy_points", "invented_or_risky_statements", "should_have_escalated", "policy_notes"],
      additionalProperties: false,
    },
  },
};

export const evaluatorSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "evaluation_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        overall_score: { type: "integer" },
        pass_fail: { type: "string" },
        readiness_signal: { type: "string" },
        category_scores: {
          type: "object",
          properties: {
            opening_warmth: { type: "integer" },
            listening_empathy: { type: "integer" },
            clarity_directness: { type: "integer" },
            policy_accuracy: { type: "integer" },
            ownership: { type: "integer" },
            problem_solving: { type: "integer" },
            de_escalation: { type: "integer" },
            escalation_judgment: { type: "integer" },
            visible_professionalism: { type: "integer" },
            closing_control: { type: "integer" },
          },
          required: [
            "opening_warmth", "listening_empathy", "clarity_directness",
            "policy_accuracy", "ownership", "problem_solving",
            "de_escalation", "escalation_judgment",
            "visible_professionalism", "closing_control"
          ],
          additionalProperties: false,
        },
        best_moments: { type: "array", items: { type: "string" } },
        missed_moments: { type: "array", items: { type: "string" } },
        critical_mistakes: { type: "array", items: { type: "string" } },
        coachable_mistakes: { type: "array", items: { type: "string" } },
        most_important_correction: { type: "string" },
        ideal_response_example: { type: "string" },
        summary: { type: "string" },
      },
      required: [
        "overall_score", "pass_fail", "readiness_signal", "category_scores",
        "best_moments", "missed_moments", "critical_mistakes", "coachable_mistakes",
        "most_important_correction", "ideal_response_example", "summary"
      ],
      additionalProperties: false,
    },
  },
};

export const employeeCoachSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "employee_coaching",
    strict: true,
    schema: {
      type: "object",
      properties: {
        employee_coaching_summary: { type: "string" },
        what_you_did_well: { type: "array", items: { type: "string" } },
        what_hurt_you: { type: "array", items: { type: "string" } },
        do_this_next_time: { type: "array", items: { type: "string" } },
        replacement_phrases: { type: "array", items: { type: "string" } },
        practice_focus: { type: "string" },
        next_recommended_scenario: { type: "string" },
      },
      required: ["employee_coaching_summary", "what_you_did_well", "what_hurt_you", "do_this_next_time", "replacement_phrases", "practice_focus", "next_recommended_scenario"],
      additionalProperties: false,
    },
  },
};

export const managerDebriefSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "manager_debrief",
    strict: true,
    schema: {
      type: "object",
      properties: {
        manager_summary: { type: "string" },
        performance_signal: { type: "string" },
        top_strengths: { type: "array", items: { type: "string" } },
        top_corrections: { type: "array", items: { type: "string" } },
        whether_live_shadowing_is_needed: { type: "boolean" },
        whether_manager_follow_up_is_needed: { type: "boolean" },
        recommended_follow_up_action: { type: "string" },
        recommended_next_drill: { type: "string" },
      },
      required: ["manager_summary", "performance_signal", "top_strengths", "top_corrections", "whether_live_shadowing_is_needed", "whether_manager_follow_up_is_needed", "recommended_follow_up_action", "recommended_next_drill"],
      additionalProperties: false,
    },
  },
};

export const adaptiveDifficultySchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "adaptive_difficulty",
    strict: true,
    schema: {
      type: "object",
      properties: {
        next_difficulty: { type: "integer" },
        difficulty_reason: { type: "string" },
        recommended_scenario_family: { type: "string" },
        recommended_emotional_intensity: { type: "string" },
        recommended_complexity: { type: "string" },
      },
      required: ["next_difficulty", "difficulty_reason", "recommended_scenario_family", "recommended_emotional_intensity", "recommended_complexity"],
      additionalProperties: false,
    },
  },
};

export const sessionQualitySchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "session_quality",
    strict: true,
    schema: {
      type: "object",
      properties: {
        session_quality: { type: "string" },
        flags: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
        retry_recommended: { type: "boolean" },
      },
      required: ["session_quality", "flags", "reason", "retry_recommended"],
      additionalProperties: false,
    },
  },
};

export const profileUpdateSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "profile_update",
    strict: true,
    schema: {
      type: "object",
      properties: {
        level_estimate: { type: "string" },
        readiness_status: { type: "string" },
        trend: { type: "string" },
        skill_map: {
          type: "object",
          properties: {
            empathy: { type: "integer" },
            clarity: { type: "integer" },
            policy_accuracy: { type: "integer" },
            ownership: { type: "integer" },
            de_escalation: { type: "integer" },
            escalation_judgment: { type: "integer" },
            professional_presence: { type: "integer" },
          },
          required: ["empathy", "clarity", "policy_accuracy", "ownership", "de_escalation", "escalation_judgment", "professional_presence"],
          additionalProperties: false,
        },
        strongest_scenario_families: { type: "array", items: { type: "string" } },
        weakest_scenario_families: { type: "array", items: { type: "string" } },
        pressure_handling: { type: "string" },
        consistency_score: { type: "integer" },
        recommended_next_steps: { type: "array", items: { type: "string" } },
        manager_attention_flag: { type: "boolean" },
      },
      required: [
        "level_estimate", "readiness_status", "trend", "skill_map",
        "strongest_scenario_families", "weakest_scenario_families",
        "pressure_handling", "consistency_score", "recommended_next_steps",
        "manager_attention_flag"
      ],
      additionalProperties: false,
    },
  },
};
