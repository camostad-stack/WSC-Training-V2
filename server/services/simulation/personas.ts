import type { PersonaReactionProfile } from "./types";

export const DEFAULT_CUSTOMER_PERSONAS = {
  customer_service: [
    {
      name: "Erin Calloway",
      communication_style: "direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
      membership_context: "Long-time member who expects clarity and follow-through.",
    },
    {
      name: "Marcus Bell",
      communication_style: "skeptical but polite",
      initial_emotion: "concerned",
      patience_level: "high",
      membership_context: "Busy parent who wants the answer without wasting time.",
    },
    {
      name: "Nina Park",
      communication_style: "warm until dismissed",
      initial_emotion: "disappointed",
      patience_level: "moderate",
      membership_context: "Member who is reasonable until she feels brushed off.",
    },
  ],
  golf: [
    {
      name: "Liam Hart",
      communication_style: "curious and comparison-driven",
      initial_emotion: "skeptical",
      patience_level: "moderate",
      membership_context: "Prospect comparing value with other clubs.",
    },
    {
      name: "Tara Benson",
      communication_style: "friendly but price-aware",
      initial_emotion: "guarded",
      patience_level: "high",
      membership_context: "Interested in lessons but wants the right fit.",
    },
  ],
  mod_emergency: [
    {
      name: "Alicia Gomez",
      communication_style: "alarmed and urgent",
      initial_emotion: "alarmed",
      patience_level: "low",
      membership_context: "Witness who needs someone competent to take control.",
    },
    {
      name: "Jordan Price",
      communication_style: "protective and focused",
      initial_emotion: "concerned",
      patience_level: "moderate",
      membership_context: "Member focused on safety, not policy explanations.",
    },
  ],
} as const;

export function mapPatienceLabelToValue(label?: string | null) {
  const normalized = (label || "moderate").toLowerCase();
  if (normalized.includes("low")) return 3;
  if (normalized.includes("high")) return 8;
  return 5;
}

export function inferStyleTokens(style?: string | null) {
  const normalized = (style || "direct").toLowerCase();
  return {
    direct: normalized.includes("direct"),
    organized: normalized.includes("organized"),
    skeptical: normalized.includes("skept"),
    warm: normalized.includes("warm") || normalized.includes("friendly"),
    urgent: normalized.includes("urgent") || normalized.includes("alarm"),
    protective: normalized.includes("protective"),
    polite: normalized.includes("polite"),
  };
}

export function buildPersonaReactionProfile(params: {
  communicationStyle?: string | null;
  patienceLabel?: string | null;
  initialEmotion?: string | null;
}): PersonaReactionProfile {
  const style = inferStyleTokens(params.communicationStyle);
  const patienceBase = mapPatienceLabelToValue(params.patienceLabel);
  const initialEmotion = (params.initialEmotion || "").toLowerCase();

  return {
    patienceModifier: patienceBase >= 7 ? -1 : patienceBase <= 3 ? 1 : 0,
    trustSensitivity: style.skeptical ? 2 : style.warm ? 0 : 1,
    offenseSensitivity: style.protective || style.direct ? 2 : style.polite ? 1 : 0,
    confusionSensitivity: style.organized || style.skeptical ? 2 : 1,
    escalationSensitivity: style.urgent || style.protective ? 2 : style.polite ? 0 : 1,
    disengagementSensitivity: style.warm ? 0 : style.skeptical ? 1 : 2,
    quietWithdrawal: style.polite && !style.direct,
    seeksManagerEarly: style.urgent || style.protective || initialEmotion.includes("alarm"),
    defaultNegativeStyle: style.polite && !style.direct
      ? "quiet_withdrawal"
      : style.skeptical
        ? "measured_skepticism"
        : "direct_pushback",
  };
}
