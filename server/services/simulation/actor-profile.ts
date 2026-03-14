import type { ScenarioDirectorResult } from "../ai/contracts";
import type { CustomerHumanProfile, SimulationStateDraft } from "./types";
import { mapPatienceLabelToValue } from "./personas";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalize(text?: string | null) {
  return (text || "").trim();
}

function inferDirectness(style: string) {
  const lower = style.toLowerCase();
  if (lower.includes("blunt") || lower.includes("direct") || lower.includes("demanding")) return 8;
  if (lower.includes("skeptical") || lower.includes("analytical") || lower.includes("measured")) return 6;
  if (lower.includes("warm") || lower.includes("friendly")) return 4;
  if (lower.includes("urgent") || lower.includes("alarmed")) return 7;
  return 5;
}

function inferSpeakingPattern(style: string): CustomerHumanProfile["speakingPattern"] {
  const lower = style.toLowerCase();
  if (lower.includes("urgent") || lower.includes("alarmed") || lower.includes("panicked")) return "urgent";
  if (lower.includes("skeptical") || lower.includes("analytical") || lower.includes("comparison")) return "skeptical";
  if (lower.includes("warm") || lower.includes("friendly")) return "warm";
  if (lower.includes("measured") || lower.includes("reserved") || lower.includes("organized")) return "measured";
  return "blunt";
}

function inferInterruptionStyle(style: string): CustomerHumanProfile["interruptionStyle"] {
  const lower = style.toLowerCase();
  if (lower.includes("urgent") || lower.includes("impatient") || lower.includes("blunt")) return "frequent";
  if (lower.includes("direct") || lower.includes("skeptical") || lower.includes("warm")) return "situational";
  return "rare";
}

function inferIndirectnessStyle(style: string): CustomerHumanProfile["indirectnessStyle"] {
  const lower = style.toLowerCase();
  if (lower.includes("warm") || lower.includes("hesitant") || lower.includes("reserved")) return "high";
  if (lower.includes("measured") || lower.includes("organized")) return "medium";
  return "low";
}

function inferSarcasmStyle(style: string, scenario: ScenarioDirectorResult): CustomerHumanProfile["sarcasmStyle"] {
  const lower = style.toLowerCase();
  if (lower.includes("skeptical") || lower.includes("dry")) return "sharp";
  if (scenario.department === "customer_service" || scenario.scenario_family === "billing_confusion") return "light";
  return "none";
}

function inferRepetitionStyle(style: string): CustomerHumanProfile["repetitionStyle"] {
  const lower = style.toLowerCase();
  if (lower.includes("urgent") || lower.includes("direct") || lower.includes("frustrated")) return "high";
  if (lower.includes("skeptical") || lower.includes("measured")) return "medium";
  return "low";
}

function inferWarmthStyle(style: string): CustomerHumanProfile["warmthStyle"] {
  const lower = style.toLowerCase();
  if (lower.includes("warm") || lower.includes("friendly")) return "warm";
  if (lower.includes("guarded") || lower.includes("skeptical") || lower.includes("reserved")) return "guarded";
  return "cool";
}

function inferUsesFragments(style: string, scenario: ScenarioDirectorResult) {
  const lower = style.toLowerCase();
  return lower.includes("direct")
    || lower.includes("urgent")
    || lower.includes("skeptical")
    || scenario.department === "mod_emergency";
}

function inferPreviousExperience(scenario: ScenarioDirectorResult) {
  const context = normalize(scenario.customer_persona.membership_context);
  if (/long-time|member for|again|already/i.test(context)) {
    return "Has dealt with the club before and expects follow-through.";
  }
  if (/prospect|first-time|guest/i.test(context)) {
    return "Does not know the club well yet and is judging competence quickly.";
  }
  return "Knows enough to have expectations, but not enough to understand internal processes.";
}

function inferSensitivityTriggers(scenario: ScenarioDirectorResult) {
  const base = [
    "vague reassurance",
    "being brushed off",
    "hearing policy without help",
    "no owner or timeline",
  ];

  if (scenario.department === "golf") {
    return [...base, "being pitched too early", "feeling steered without discovery"];
  }

  if (scenario.department === "mod_emergency") {
    return [...base, "loss of control", "slow direction in an urgent moment", "someone sounding unsure during a safety issue"];
  }

  return [...base, "repeating the same question", "billing or reservation uncertainty"];
}

function inferHeardSignals(scenario: ScenarioDirectorResult) {
  if (scenario.department === "golf") {
    return [
      "asking what matters to them before recommending anything",
      "connecting the recommendation to what they actually said",
      "giving a concrete next step",
    ];
  }

  if (scenario.department === "mod_emergency") {
    return [
      "taking control quickly",
      "giving clear direction",
      "explaining who owns the next step",
    ];
  }

  return [
    "acknowledging the actual concern",
    "answering the real question directly",
    "giving a concrete next step with a timeline",
  ];
}

function inferDismissedSignals(scenario: ScenarioDirectorResult) {
  if (scenario.department === "mod_emergency") {
    return [
      "speaking calmly but not taking control",
      "explaining policy before the immediate action",
      "giving no direction",
    ];
  }

  return [
    "scripted empathy with no action",
    "repeating general reassurance",
    "asking them to wait without saying who owns it",
    "acting like the question was already answered when it was not",
  ];
}

function inferSkepticismTriggers(scenario: ScenarioDirectorResult) {
  return Array.from(new Set([
    ...(scenario.lose_trust_if || []),
    "hearing the same vague answer twice",
    "a confident answer without specifics",
    "ownership without an actual action",
    "a handoff with no person or timeline attached",
  ]));
}

function inferEmotionalResidue(scenario: ScenarioDirectorResult) {
  const parts = [
    normalize(scenario.past_history),
    normalize(scenario.hidden_context),
    normalize(scenario.pressure_context),
  ].filter(Boolean);
  return parts[0] || "The issue is already carrying some emotional weight before the employee says anything useful.";
}

export function buildCustomerHumanProfile(params: {
  scenario: ScenarioDirectorResult;
  state: Pick<SimulationStateDraft, "customer_goal" | "customer_belief_about_problem" | "true_underlying_problem" | "urgency_level" | "trust_level" | "willingness_to_accept_redirect" | "willingness_to_escalate">;
}) : CustomerHumanProfile {
  const style = normalize(params.scenario.customer_persona.communication_style || "direct");
  const patienceLevel = mapPatienceLabelToValue(params.scenario.customer_persona.patience_level);
  const initialTrust = params.state.trust_level || (params.scenario.department === "golf" ? 4 : 3);

  return {
    identityFlavor: `${params.scenario.customer_persona.name} — ${normalize(params.scenario.customer_persona.membership_context)}`,
    issueReason: normalize(params.scenario.situation_summary),
    whatTheyWant: normalize(params.state.customer_goal || params.scenario.opening_line),
    whatTheyThinkHappened: normalize(params.state.customer_belief_about_problem || params.scenario.opening_line),
    whatActuallyHappened: normalize(params.state.true_underlying_problem || params.scenario.hidden_facts[0] || params.scenario.situation_summary),
    hiddenContext: normalize(params.scenario.hidden_context),
    pressureContext: normalize(params.scenario.pressure_context),
    emotionalBaseline: normalize(params.scenario.customer_persona.initial_emotion || "concerned"),
    emotionalResidue: inferEmotionalResidue(params.scenario),
    urgencyLevel: params.state.urgency_level,
    patienceLevel,
    directnessLevel: inferDirectness(style),
    trustBaseline: initialTrust,
    priorBusinessExperience: normalize(params.scenario.past_history) || inferPreviousExperience(params.scenario),
    sensitivityTriggers: params.scenario.emotional_triggers?.length
      ? params.scenario.emotional_triggers
      : inferSensitivityTriggers(params.scenario),
    frictionPoints: params.scenario.friction_points || [],
    likelyAssumptions: params.scenario.likely_assumptions || [],
    communicationStyle: style,
    stressContext: normalize(params.scenario.pressure_context) || (
      params.state.urgency_level >= 8
        ? "The situation feels urgent and the customer wants control now."
        : params.state.urgency_level >= 5
          ? "The customer feels time pressure and wants something concrete."
          : "The customer mainly wants clarity and follow-through."
    ),
    opennessToResolution: clamp((params.state.trust_level + patienceLevel + params.state.willingness_to_accept_redirect) / 3),
    willingnessToEscalate: clamp((params.state.willingness_to_escalate + (10 - initialTrust)) / 2),
    whatMakesThemFeelHeard: params.scenario.what_hearing_them_out_sounds_like?.length
      ? params.scenario.what_hearing_them_out_sounds_like
      : inferHeardSignals(params.scenario),
    whatMakesThemFeelBrushedOff: params.scenario.lose_trust_if?.length
      ? params.scenario.lose_trust_if
      : inferDismissedSignals(params.scenario),
    whatMakesThemSkeptical: inferSkepticismTriggers(params.scenario),
    whatMakesNextStepCredible: params.scenario.credible_next_steps || [],
    whatCalmsThemDown: params.scenario.calm_down_if || [],
    whatMakesThemChallenge: params.scenario.lose_trust_if || [],
    speakingPattern: inferSpeakingPattern(style),
    interruptionStyle: inferInterruptionStyle(style),
    indirectnessStyle: inferIndirectnessStyle(style),
    sarcasmStyle: inferSarcasmStyle(style, params.scenario),
    repetitionStyle: inferRepetitionStyle(style),
    warmthStyle: inferWarmthStyle(style),
    usesFragments: inferUsesFragments(style, params.scenario),
  };
}
