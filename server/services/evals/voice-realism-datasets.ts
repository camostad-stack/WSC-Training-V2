import type { ScenarioDirectorResult } from "../ai/contracts";
import { deriveScenarioHumanContext } from "../../../shared/wsc-content";
import type { VoiceRenderProvider } from "../voice-rendering";

export interface ConversationEvalExpectation {
  terminalOutcome: "RESOLVED" | "ESCALATED" | "ABANDONED" | "TIMED_OUT" | null;
  requiresPrematureClosureBlock?: boolean;
  minTurnsComplaintOpen?: number;
  shouldRecoverTrust?: boolean;
}

export interface ConversationEvalCase {
  id: string;
  title: string;
  category:
    | "polite_but_unresolved"
    | "vague_next_step"
    | "invalid_escalation"
    | "proper_escalation"
    | "true_resolution"
    | "trust_decline_recovery"
    | "long_call_realism";
  scenario: ScenarioDirectorResult;
  employeeResponses: string[];
  preferredVoiceProvider?: VoiceRenderProvider;
  expectation: ConversationEvalExpectation;
}

export interface VoiceProviderEvalSample {
  id: string;
  title: string;
  text: string;
  scenario: ScenarioDirectorResult;
  sessionSeed: string;
  providers: VoiceRenderProvider[];
  preferredVoiceProvider?: VoiceRenderProvider;
}

export interface VoiceRotationEvalCase {
  id: string;
  title: string;
  scenario: ScenarioDirectorResult;
  sessionSeeds: string[];
  preferredProvider?: VoiceRenderProvider;
  expectRepeatCallerConsistency?: boolean;
}

export interface VoiceAndRealismEvalDataset {
  conversationCases: ConversationEvalCase[];
  voiceProviderSamples: VoiceProviderEvalSample[];
  voiceRotationCases: VoiceRotationEvalCase[];
}

function buildScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  const family = overrides.scenario_family || "billing_confusion";
  const department = overrides.department || "customer_service";
  const humanContext = deriveScenarioHumanContext({
    department,
    scenario_family: family,
  });

  return {
    scenario_id: "eval-billing-confusion",
    department,
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: family,
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Long-time member who watches billing closely",
      communication_style: "direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees two membership-related charges and wants a direct explanation plus the next step.",
    opening_line: "I need to know why I was charged twice and what you're doing about it.",
    hidden_facts: ["One charge is pending and one is final."],
    approved_resolution_paths: ["Verify the ledger, explain pending vs final, and give a concrete next step with a timeline."],
    required_behaviors: ["Answer directly", "Take ownership", "Give a real next step"],
    critical_errors: ["Blame the member", "Guess at policy", "Dismiss the concern"],
    branch_logic: {
      if_empathy_is_strong: "Customer becomes a little easier to help if the answer is also concrete.",
      if_answer_is_vague: "Customer pushes harder and gets more skeptical.",
      if_policy_is_wrong: "Customer questions competence and may ask for a manager.",
      if_employee_takes_ownership: "Customer stays engaged.",
      if_employee_fails_to_help: "Customer frustration compounds.",
      if_employee_escalates_correctly: "Customer accepts a handoff if it is concrete.",
    },
    emotion_progression: {
      starting_state: "frustrated",
      better_if: ["clear answer", "ownership", "real timeline"],
      worse_if: ["vague answer", "dismissive tone", "wrong policy"],
    },
    completion_rules: {
      resolved_if: ["Customer understands the charge status and what happens next."],
      end_early_if: ["Employee becomes openly rude or makes the complaint worse."],
      manager_required_if: ["Billing exception truly requires supervisor review."],
    },
    completion_criteria: [
      "customer understands the billing breakdown",
      "employee explains the next step clearly",
      "ownership is shown before closing",
    ],
    failure_criteria: [
      "employee ends the interaction without an outcome",
      "customer remains confused about the core issue",
      "no clear next step is provided",
    ],
    recommended_turns: 4,
    motive: humanContext.motive,
    hidden_context: humanContext.hidden_context,
    personality_style: humanContext.personality_style,
    past_history: humanContext.past_history,
    pressure_context: humanContext.pressure_context,
    friction_points: humanContext.friction_points,
    emotional_triggers: humanContext.emotional_triggers,
    likely_assumptions: humanContext.likely_assumptions,
    what_hearing_them_out_sounds_like: humanContext.what_hearing_them_out_sounds_like,
    credible_next_steps: humanContext.credible_next_steps,
    calm_down_if: humanContext.calm_down_if,
    lose_trust_if: humanContext.lose_trust_if,
    ...overrides,
  };
}

function buildCancellationScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return buildScenario({
    scenario_id: "eval-cancellation-request",
    scenario_family: "cancellation_request",
    situation_summary: "A member wants to know whether their cancellation is active and who owns the follow-up if it is not.",
    opening_line: "I need to know whether this cancellation actually went through and what happens if it didn't.",
    hidden_facts: ["The cancellation request exists, but billing still has to confirm the stop date."],
    approved_resolution_paths: ["Confirm the current cancellation status and give a concrete owner, action, and timeline if follow-up is still needed."],
    completion_rules: {
      resolved_if: ["Customer knows whether cancellation is active or pending and who owns the next action."],
      end_early_if: ["Employee becomes openly rude or refuses to check the status."],
      manager_required_if: ["Cancellation exception needs supervisor approval or billing override."],
    },
    completion_criteria: [
      "customer understands the current cancellation status",
      "employee names who owns the next step",
      "timeline is concrete if follow-up is still needed",
    ],
    failure_criteria: [
      "cancellation status remains unclear",
      "follow-up is vague or ownerless",
      "employee closes early",
    ],
    ...overrides,
  });
}

export function buildVoiceAndRealismEvalDataset(): VoiceAndRealismEvalDataset {
  const billing = buildScenario();
  const cancellation = buildCancellationScenario();
  const repeatCallerScenario = buildScenario({
    scenario_id: "eval-repeat-caller",
    repeat_caller_key: "member-erin-calloway-billing",
    preserve_caller_voice: true,
  });

  return {
    conversationCases: [
      {
        id: "polite-but-unresolved",
        title: "Polite but unresolved employee",
        category: "polite_but_unresolved",
        scenario: billing,
        employeeResponses: [
          "I can see why that feels frustrating, and I really appreciate your patience while we look into this.",
          "We are reviewing it now and will get back to you soon.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: null,
          minTurnsComplaintOpen: 2,
        },
      },
      {
        id: "vague-next-step",
        title: "Vague next step",
        category: "vague_next_step",
        scenario: billing,
        employeeResponses: [
          "We are looking into it.",
          "Someone will follow up on that.",
          "You should be all set.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: null,
          requiresPrematureClosureBlock: true,
          minTurnsComplaintOpen: 3,
        },
      },
      {
        id: "invalid-escalation",
        title: "Invalid escalation",
        category: "invalid_escalation",
        scenario: cancellation,
        employeeResponses: [
          "I can get a manager involved.",
          "They will take a look when they can.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: null,
          minTurnsComplaintOpen: 2,
        },
      },
      {
        id: "proper-escalation",
        title: "Proper escalation",
        category: "proper_escalation",
        scenario: cancellation,
        employeeResponses: [
          "Billing manager Dana is taking over this cancellation review right now, I am handing it to her directly, and she will call you within ten minutes with the confirmed stop date.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: "ESCALATED",
        },
      },
      {
        id: "true-resolution",
        title: "True resolution",
        category: "true_resolution",
        scenario: billing,
        employeeResponses: [
          "I am checking the ledger now.",
          "The final charge is your active membership and the other one is only a pending authorization, not a second settled charge.",
          "I am personally sending the billing correction request to Dana in billing right now, and I will email you the confirmation by 4 p.m. today.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: "RESOLVED",
        },
      },
      {
        id: "trust-decline-recovery",
        title: "Customer loses trust and regains it",
        category: "trust_decline_recovery",
        scenario: billing,
        employeeResponses: [
          "Calm down. We already told you we would look at it.",
          "You are right to ask. I am checking the charge now, and I own the follow-up.",
          "One charge is pending, one is final, and I am sending the correction to Dana in billing right now. I own the follow-up and you will have my confirmation by 4 p.m. today.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: "RESOLVED",
          shouldRecoverTrust: true,
          minTurnsComplaintOpen: 2,
        },
      },
      {
        id: "long-call-realism",
        title: "Long-call realism",
        category: "long_call_realism",
        scenario: billing,
        employeeResponses: [
          "We are looking into it.",
          "Someone will follow up.",
          "It should get sorted out soon.",
          "We still need a little more time on this.",
          "The team is still reviewing it.",
        ],
        preferredVoiceProvider: "cartesia",
        expectation: {
          terminalOutcome: null,
          minTurnsComplaintOpen: 5,
        },
      },
    ],
    voiceProviderSamples: [
      {
        id: "skeptical-gap",
        title: "Skeptical unresolved gap",
        text: "Okay, but who exactly is following up, and when?",
        scenario: billing,
        sessionSeed: "voice-sample-skeptical",
        providers: ["cartesia", "openai-native-speech"],
        preferredVoiceProvider: "cartesia",
      },
      {
        id: "annoyed-pushback",
        title: "Annoyed pushback",
        text: "No, that's still not an answer. What are you actually doing right now?",
        scenario: billing,
        sessionSeed: "voice-sample-annoyed",
        providers: ["cartesia", "openai-native-speech"],
        preferredVoiceProvider: "cartesia",
      },
      {
        id: "relieved-close",
        title: "Relieved but guarded close",
        text: "Okay. If that update lands this afternoon, we're good.",
        scenario: billing,
        sessionSeed: "voice-sample-relieved",
        providers: ["cartesia", "openai-native-speech"],
        preferredVoiceProvider: "cartesia",
      },
    ],
    voiceRotationCases: [
      {
        id: "same-complaint-multi-cast",
        title: "Same complaint across multiple casts",
        scenario: billing,
        sessionSeeds: [
          "cast-a",
          "cast-b",
          "cast-c",
          "cast-d",
          "cast-e",
          "cast-f",
        ],
        preferredProvider: "cartesia",
      },
      {
        id: "repeat-caller-consistency",
        title: "Repeat caller consistency",
        scenario: repeatCallerScenario,
        sessionSeeds: [
          "repeat-a",
          "repeat-b",
          "repeat-c",
        ],
        preferredProvider: "cartesia",
        expectRepeatCallerConsistency: true,
      },
      {
        id: "same-bot-feel-regression",
        title: "Repeated sessions same-bot regression check",
        scenario: billing,
        sessionSeeds: [
          "nearby-1",
          "nearby-2",
          "nearby-3",
          "nearby-4",
          "nearby-5",
          "nearby-6",
          "nearby-7",
          "nearby-8",
        ],
        preferredProvider: "cartesia",
      },
    ],
  };
}
