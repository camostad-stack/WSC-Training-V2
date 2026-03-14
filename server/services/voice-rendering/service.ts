import type { ScenarioDirectorResult } from "../ai/contracts";
import { listVoicesForProvider, selectVoiceIdForProvider } from "./catalog";
import type {
  CustomerVoiceCast,
  VoiceAgeFlavor,
  VoiceApologyRhythm,
  VoiceClosureStyle,
  VoiceEmotionalArcPattern,
  VoiceEmotionalResponsiveness,
  VoiceEnergy,
  VoiceFallbackEvent,
  VoiceHesitationTendency,
  VoiceInterruptionTendency,
  VoiceOpenerCadence,
  VoicePace,
  VoicePersonaArchetype,
  VoiceProviderCapabilities,
  VoiceRenderProvider,
  VoiceSharpness,
  VoiceVerbosityTendency,
  VoiceWarmth,
} from "./types";

const OPENER_CADENCES: VoiceOpenerCadence[] = [
  "straight-to-the-point",
  "guarded-then-direct",
  "brisk-with-pressure",
  "warm-but-uncertain",
  "skeptical-check-in",
  "frayed-and-clipped",
];

const APOLOGY_RHYTHMS: VoiceApologyRhythm[] = [
  "rare-and-brusque",
  "quick-self-correction",
  "softened-reluctantly",
  "matter-of-fact",
  "defensive-under-breath",
];

const CLOSURE_STYLES: VoiceClosureStyle[] = [
  "guarded-acceptance",
  "skeptical-last-check",
  "brief-drop-off",
  "practical-sign-off",
  "relieved-but-watching",
];

const EMOTIONAL_ARC_PATTERNS: VoiceEmotionalArcPattern[] = [
  "spikes-before-softening",
  "flat-then-wary-trust",
  "skeptical-until-specifics",
  "frayed-then-practical",
  "warmth-lost-then-recovered",
];

const CADENCE_FINGERPRINTS = [
  "tight-and-brisk",
  "measured-with-pauses",
  "short-bursts-under-pressure",
  "steady-with-light-hesitation",
  "warm-and-conversational",
  "skeptical-and-clipped",
  "quick-pivots-under-stress",
  "friendly-then-firm",
] as const;

interface VoiceAssignmentHistoryItem {
  sessionSeed: string;
  scenarioId: string;
  provider: VoiceRenderProvider;
  voiceId: string;
  personaArchetype: VoicePersonaArchetype;
  cadenceFingerprint: string;
  openerCadencePattern: VoiceOpenerCadence;
  apologyRhythmPattern: VoiceApologyRhythm;
  closurePhrasingStyle: VoiceClosureStyle;
  emotionalArcPattern: VoiceEmotionalArcPattern;
  assignedAt: number;
  repeatCallerKey?: string;
}

export interface VoiceCastingService {
  assignSessionIdentity(params: {
    scenario: ScenarioDirectorResult;
    sessionSeed: string;
    preferredProvider?: VoiceRenderProvider;
    availableProviders: VoiceRenderProvider[];
    getProviderCapabilities: (provider: VoiceRenderProvider) => VoiceProviderCapabilities;
    baseSettings: {
      ageFlavor: VoiceAgeFlavor;
      warmth: VoiceWarmth;
      sharpness: VoiceSharpness;
      energy: VoiceEnergy;
      pace: VoicePace;
      interruptionTendency: VoiceInterruptionTendency;
      hesitationTendency: VoiceHesitationTendency;
      verbosityTendency: VoiceVerbosityTendency;
      emotionalResponsiveness: VoiceEmotionalResponsiveness;
    };
  }): Pick<
    CustomerVoiceCast,
    | "provider"
    | "voiceId"
    | "cadenceFingerprint"
    | "personaArchetype"
    | "openerCadencePattern"
    | "apologyRhythmPattern"
    | "closurePhrasingStyle"
    | "emotionalArcPattern"
    | "repeatCallerKey"
    | "preserveCallerVoice"
    | "castingDiagnostics"
    | "providerCapabilities"
  > & {
    adjustedSettings: {
      pace: VoicePace;
      warmth: VoiceWarmth;
      sharpness: VoiceSharpness;
      energy: VoiceEnergy;
      ageFlavor: VoiceAgeFlavor;
      emotionalResponsiveness: VoiceEmotionalResponsiveness;
      interruptionTendency: VoiceInterruptionTendency;
      hesitationTendency: VoiceHesitationTendency;
      verbosityTendency: VoiceVerbosityTendency;
    };
  };
  recordFallbackEvent(event: VoiceFallbackEvent): void;
  getRecentVoiceUsageFrequency(provider: VoiceRenderProvider, voiceId: string): number;
  getFallbackEvents(): VoiceFallbackEvent[];
  reset(): void;
}

function hashText(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function reverseText(input: string) {
  return input.split("").reverse().join("");
}

function clampIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

function normalize(text?: string | null) {
  return (text || "").trim().toLowerCase();
}

function deriveRepeatCallerConfig(scenario: ScenarioDirectorResult) {
  const key = (scenario as ScenarioDirectorResult & {
    repeat_caller_key?: string;
    preserve_caller_voice?: boolean;
  }).repeat_caller_key?.trim();
  const preserve = Boolean((scenario as ScenarioDirectorResult & { preserve_caller_voice?: boolean }).preserve_caller_voice);
  return {
    repeatCallerKey: key && preserve ? key : undefined,
    preserveCallerVoice: preserve && Boolean(key),
  };
}

function derivePersonaArchetype(scenario: ScenarioDirectorResult): VoicePersonaArchetype {
  const style = normalize(scenario.customer_persona.communication_style);
  const emotion = normalize(scenario.customer_persona.initial_emotion);
  const patience = normalize(scenario.customer_persona.patience_level);
  const personality = normalize(scenario.personality_style);

  if (/blunt|direct/.test(style) && /low/.test(patience)) {
    return "blunt_low_patience";
  }
  if ((/urgent|impatient|rushed/.test(style) || /angry|urgent/.test(emotion)) && /low/.test(patience)) {
    return "rushed_impatient";
  }
  if (/skeptical/.test(style) && /calm|controlled|measured/.test(`${style} ${personality}`)) {
    return "calm_skeptical";
  }
  if (/polite|reasonable|work with/.test(`${style} ${personality}`) && /frustrated|annoyed/.test(emotion)) {
    return "polite_frustrated";
  }
  if (/warm|friendly/.test(`${style} ${personality}`) && /confused|uncertain|hesitant/.test(`${emotion} ${style}`)) {
    return "warm_confused";
  }
  if (/suspicious|skeptical|guarded/.test(`${style} ${personality}`) && /direct|organized|practical/.test(`${style} ${personality}`)) {
    return "suspicious_direct";
  }
  if (/anxious|concerned|alert/.test(emotion)) {
    return "anxious_cautious";
  }
  return "steady_practical";
}

function normalizeVoiceHintLocale(locale?: string) {
  return normalize(locale).replace(/_/g, "-");
}

function buildPreferredVoiceTraits(scenario: ScenarioDirectorResult, archetype: VoicePersonaArchetype) {
  const style = normalize(scenario.customer_persona.communication_style);
  const emotion = normalize(scenario.customer_persona.initial_emotion);
  const traits = new Set<string>();

  if (/warm|friendly|supportive/.test(style)) traits.add("warm");
  if (/direct|blunt|organized/.test(style)) traits.add("direct");
  if (/skeptical|guarded|reserved|analytical/.test(style)) traits.add("grounded");
  if (/curious|friendly|casual/.test(style)) traits.add("conversational");
  if (/detail|measured|careful/.test(style)) traits.add("measured");
  if (/urgent|fast|time-sensitive|impatient/.test(style)) traits.add("quick");
  if (/annoyed|angry|frustrated/.test(emotion)) traits.add("firm");
  if (/confused|curious|uncertain/.test(emotion)) traits.add("bright");

  switch (archetype) {
    case "rushed_impatient":
      traits.add("firm");
      traits.add("direct");
      break;
    case "calm_skeptical":
      traits.add("grounded");
      traits.add("measured");
      break;
    case "polite_frustrated":
      traits.add("warm");
      traits.add("clear");
      break;
    case "warm_confused":
      traits.add("warm");
      traits.add("bright");
      break;
    case "suspicious_direct":
      traits.add("grounded");
      traits.add("direct");
      break;
    default:
      break;
  }

  return traits;
}

function scoreVoiceFit(params: {
  scenario: ScenarioDirectorResult;
  archetype: VoicePersonaArchetype;
  provider: VoiceRenderProvider;
  voiceId: string;
  baseAgeFlavor: VoiceAgeFlavor;
}) {
  const voice = listVoicesForProvider(params.provider).find((candidate) => candidate.voiceId === params.voiceId);
  if (!voice) return 0;

  const hint = params.scenario.customer_persona.voice_hint;
  const preferredLocale = normalizeVoiceHintLocale(hint?.locale);
  const preferredPresentation = hint?.presentation;
  const preferredAgeFlavor = hint?.age_flavor || params.baseAgeFlavor;
  const preferredTraits = buildPreferredVoiceTraits(params.scenario, params.archetype);
  let score = 0;

  if (preferredPresentation && voice.genderFlavor === preferredPresentation) {
    score += 22;
  } else if (preferredPresentation && voice.genderFlavor && voice.genderFlavor !== preferredPresentation) {
    score -= 8;
  }

  if (preferredAgeFlavor && voice.ageFlavor === preferredAgeFlavor) {
    score += 12;
  }

  if (preferredLocale) {
    const voiceLocale = normalizeVoiceHintLocale(voice.locale);
    if (voiceLocale === preferredLocale) {
      score += 10;
    } else if (voiceLocale.split("-")[0] === preferredLocale.split("-")[0]) {
      score += 5;
    }
  }

  for (const trait of voice.traits) {
    if (preferredTraits.has(normalize(trait))) {
      score += 4;
    }
  }

  return score;
}

function adjustSettingsForPersona<T extends {
  pace: VoicePace;
  warmth: VoiceWarmth;
  sharpness: VoiceSharpness;
  energy: VoiceEnergy;
  ageFlavor: VoiceAgeFlavor;
  emotionalResponsiveness: VoiceEmotionalResponsiveness;
  interruptionTendency: VoiceInterruptionTendency;
  hesitationTendency: VoiceHesitationTendency;
  verbosityTendency: VoiceVerbosityTendency;
}>(settings: T, archetype: VoicePersonaArchetype): T {
  switch (archetype) {
    case "rushed_impatient":
      return { ...settings, pace: "brisk", energy: "high", sharpness: "edgy", interruptionTendency: "frequent", verbosityTendency: "brief" };
    case "calm_skeptical":
      return { ...settings, pace: "steady", warmth: "cool", sharpness: "balanced", interruptionTendency: "situational", hesitationTendency: "rare" };
    case "polite_frustrated":
      return { ...settings, warmth: "warm", energy: "medium", emotionalResponsiveness: "flexible", interruptionTendency: "situational" };
    case "blunt_low_patience":
      return { ...settings, pace: "brisk", sharpness: "edgy", energy: "high", interruptionTendency: "frequent", hesitationTendency: "rare" };
    case "warm_confused":
      return { ...settings, warmth: "warm", pace: "slow", hesitationTendency: "noticeable", emotionalResponsiveness: "flexible" };
    case "suspicious_direct":
      return { ...settings, warmth: "cool", sharpness: "edgy", pace: "steady", verbosityTendency: "brief" };
    case "anxious_cautious":
      return { ...settings, pace: "slow", energy: "medium", hesitationTendency: "noticeable", emotionalResponsiveness: "volatile" };
    default:
      return { ...settings, pace: settings.pace === "brisk" ? "steady" : settings.pace, verbosityTendency: "balanced" };
  }
}

function countRecent<T>(history: VoiceAssignmentHistoryItem[], matcher: (item: VoiceAssignmentHistoryItem) => boolean) {
  return history.filter(matcher).length;
}

function scoreCandidate(params: {
  seed: string;
  label: string;
  recencyPenalty: number;
  immediateRepeatPenalty: number;
  fitBonus?: number;
}) {
  const noise = hashText(`${params.seed}:${params.label}`) % 17;
  return (params.fitBonus || 0) + noise - params.recencyPenalty - params.immediateRepeatPenalty;
}

function choosePattern<T extends string>(params: {
  options: readonly T[];
  history: VoiceAssignmentHistoryItem[];
  seed: string;
  label: string;
  readFromItem: (item: VoiceAssignmentHistoryItem) => T;
  preferred?: readonly T[];
}) {
  let best = params.options[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const last = params.history[params.history.length - 1];

  for (const option of params.options) {
    const recentUsage = countRecent(params.history, (item) => params.readFromItem(item) === option);
    const immediateRepeatPenalty = last && params.readFromItem(last) === option ? 40 : 0;
    const fitBonus = params.preferred?.includes(option) ? 15 : 0;
    const score = scoreCandidate({
      seed: params.seed,
      label: `${params.label}:${option}`,
      recencyPenalty: recentUsage * 10,
      immediateRepeatPenalty,
      fitBonus,
    });
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }

  return best;
}

function getPersonaPatternPreferences(archetype: VoicePersonaArchetype): {
  opener: readonly VoiceOpenerCadence[];
  apology: readonly VoiceApologyRhythm[];
  closure: readonly VoiceClosureStyle[];
  emotionalArc: readonly VoiceEmotionalArcPattern[];
} {
  switch (archetype) {
    case "rushed_impatient":
      return {
        opener: ["brisk-with-pressure", "frayed-and-clipped"] as VoiceOpenerCadence[],
        apology: ["rare-and-brusque"] as VoiceApologyRhythm[],
        closure: ["brief-drop-off", "skeptical-last-check"] as VoiceClosureStyle[],
        emotionalArc: ["spikes-before-softening", "frayed-then-practical"] as VoiceEmotionalArcPattern[],
      };
    case "calm_skeptical":
      return {
        opener: ["skeptical-check-in", "guarded-then-direct"],
        apology: ["matter-of-fact"],
        closure: ["skeptical-last-check", "guarded-acceptance"],
        emotionalArc: ["skeptical-until-specifics", "flat-then-wary-trust"],
      };
    case "polite_frustrated":
      return {
        opener: ["guarded-then-direct", "straight-to-the-point"],
        apology: ["softened-reluctantly", "quick-self-correction"],
        closure: ["relieved-but-watching", "guarded-acceptance"],
        emotionalArc: ["warmth-lost-then-recovered", "flat-then-wary-trust"],
      };
    case "warm_confused":
      return {
        opener: ["warm-but-uncertain"],
        apology: ["quick-self-correction", "softened-reluctantly"],
        closure: ["practical-sign-off"],
        emotionalArc: ["warmth-lost-then-recovered"],
      };
    case "suspicious_direct":
      return {
        opener: ["skeptical-check-in", "straight-to-the-point"],
        apology: ["defensive-under-breath", "matter-of-fact"],
        closure: ["skeptical-last-check", "brief-drop-off"],
        emotionalArc: ["skeptical-until-specifics"],
      };
    default:
      return {
        opener: ["straight-to-the-point", "guarded-then-direct"],
        apology: ["matter-of-fact", "quick-self-correction"],
        closure: ["practical-sign-off", "guarded-acceptance"],
        emotionalArc: ["flat-then-wary-trust", "frayed-then-practical"],
      };
  }
}

function buildAssignmentReasons(params: {
  archetype: VoicePersonaArchetype;
  recentVoiceUsage: number;
  recentProviderUsage: number;
  repeatCaller: boolean;
  voiceHintApplied: boolean;
}) {
  const reasons = [`persona=${params.archetype}`];
  if (params.repeatCaller) reasons.push("repeat-caller-preserved");
  if (params.voiceHintApplied) reasons.push("explicit-voice-hint");
  if (params.recentVoiceUsage > 0) reasons.push(`voice-rotated-after-${params.recentVoiceUsage}-recent-uses`);
  if (params.recentProviderUsage > 0) reasons.push(`provider-balance-${params.recentProviderUsage}`);
  return reasons;
}

export function createVoiceCastingService(options?: {
  historyLimit?: number;
  initialHistory?: VoiceAssignmentHistoryItem[];
}) : VoiceCastingService {
  const history: VoiceAssignmentHistoryItem[] = [...(options?.initialHistory || [])];
  const repeatCallerAssignments = new Map<string, VoiceAssignmentHistoryItem>();
  const fallbackEvents: VoiceFallbackEvent[] = [];
  const historyLimit = options?.historyLimit ?? 24;

  function recentHistory() {
    return history.slice(-historyLimit);
  }

  function persistAssignment(item: VoiceAssignmentHistoryItem) {
    history.push(item);
    while (history.length > historyLimit) {
      history.shift();
    }
    if (item.repeatCallerKey) {
      repeatCallerAssignments.set(item.repeatCallerKey, item);
    }
  }

  function chooseProvider(params: {
    sessionSeed: string;
    preferredProvider?: VoiceRenderProvider;
    availableProviders: VoiceRenderProvider[];
    archetype: VoicePersonaArchetype;
  }) {
    if (params.preferredProvider && params.availableProviders.includes(params.preferredProvider)) {
      return params.preferredProvider;
    }
    const recent = recentHistory();
    const last = recent[recent.length - 1];
    let best = params.availableProviders[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const provider of params.availableProviders) {
      const recentUsage = countRecent(recent, (item) => item.provider === provider);
      const immediateRepeatPenalty = last?.provider === provider ? 40 : 0;
      const fitBonus = provider === "cartesia"
        ? 14
        : provider === "openai-realtime-native"
          ? 10
          : provider === "openai-native-speech"
            ? 8
            : provider === "browser-native-speech"
              ? 2
              : 4;
      const score = scoreCandidate({
        seed: params.sessionSeed,
        label: `provider:${provider}:${params.archetype}`,
        recencyPenalty: recentUsage * 16,
        immediateRepeatPenalty,
        fitBonus,
      });
      if (score > bestScore) {
        best = provider;
        bestScore = score;
      }
    }

    return best;
  }

  function chooseVoiceId(params: {
    scenario: ScenarioDirectorResult;
    provider: VoiceRenderProvider;
    sessionSeed: string;
    archetype: VoicePersonaArchetype;
    baseAgeFlavor: VoiceAgeFlavor;
  }) {
    const voices = listVoicesForProvider(params.provider);
    const recent = recentHistory();
    const last = recent[recent.length - 1];
    let best = selectVoiceIdForProvider(params.provider, `${params.sessionSeed}:${params.archetype}`);
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const voice of voices) {
      const recentUsage = countRecent(recent, (item) => item.provider === params.provider && item.voiceId === voice.voiceId);
      const immediateRepeatPenalty = last?.provider === params.provider && last.voiceId === voice.voiceId ? 45 : 0;
      const score = scoreCandidate({
        seed: params.sessionSeed,
        label: `voice:${params.provider}:${voice.voiceId}:${params.archetype}`,
        recencyPenalty: recentUsage * 22,
        immediateRepeatPenalty,
        fitBonus: scoreVoiceFit({
          scenario: params.scenario,
          archetype: params.archetype,
          provider: params.provider,
          voiceId: voice.voiceId,
          baseAgeFlavor: params.baseAgeFlavor,
        }),
      });
      if (score > bestScore) {
        best = voice.voiceId;
        bestScore = score;
      }
    }

    return best;
  }

  return {
    assignSessionIdentity(params) {
      const repeatCallerConfig = deriveRepeatCallerConfig(params.scenario);
      const archetype = derivePersonaArchetype(params.scenario);
      const adjustedSettings = adjustSettingsForPersona(params.baseSettings, archetype);
      const recent = recentHistory();
      const preserved = repeatCallerConfig.repeatCallerKey
        ? repeatCallerAssignments.get(repeatCallerConfig.repeatCallerKey)
        : undefined;

      const provider = preserved?.provider || chooseProvider({
        sessionSeed: params.sessionSeed,
        preferredProvider: params.preferredProvider,
        availableProviders: params.availableProviders,
        archetype,
      });
      const providerCapabilities = params.getProviderCapabilities(provider);
      const voiceId = preserved?.voiceId || chooseVoiceId({
        scenario: params.scenario,
        provider,
        sessionSeed: `${params.sessionSeed}:${params.scenario.scenario_id}`,
        archetype,
        baseAgeFlavor: adjustedSettings.ageFlavor,
      });
      const patternPrefs = getPersonaPatternPreferences(archetype);
      const cadenceFingerprint = preserved?.cadenceFingerprint || choosePattern({
        options: [...CADENCE_FINGERPRINTS],
        history: recent,
        seed: params.sessionSeed,
        label: "cadence",
        readFromItem: (item) => item.cadenceFingerprint,
      });
      const openerCadencePattern = preserved?.openerCadencePattern || choosePattern({
        options: OPENER_CADENCES,
        history: recent,
        seed: params.sessionSeed,
        label: "opener",
        readFromItem: (item) => item.openerCadencePattern,
        preferred: patternPrefs.opener,
      });
      const apologyRhythmPattern = preserved?.apologyRhythmPattern || choosePattern({
        options: APOLOGY_RHYTHMS,
        history: recent,
        seed: params.sessionSeed,
        label: "apology",
        readFromItem: (item) => item.apologyRhythmPattern,
        preferred: patternPrefs.apology,
      });
      const closurePhrasingStyle = preserved?.closurePhrasingStyle || choosePattern({
        options: CLOSURE_STYLES,
        history: recent,
        seed: params.sessionSeed,
        label: "closure",
        readFromItem: (item) => item.closurePhrasingStyle,
        preferred: patternPrefs.closure,
      });
      const emotionalArcPattern = preserved?.emotionalArcPattern || choosePattern({
        options: EMOTIONAL_ARC_PATTERNS,
        history: recent,
        seed: params.sessionSeed,
        label: "emotional-arc",
        readFromItem: (item) => item.emotionalArcPattern,
        preferred: patternPrefs.emotionalArc,
      });

      const recentVoiceUsageFrequency = countRecent(recent, (item) => item.provider === provider && item.voiceId === voiceId);
      const recentProviderUsageFrequency = countRecent(recent, (item) => item.provider === provider);
      const recentPersonaUsageFrequency = countRecent(recent, (item) => item.personaArchetype === archetype);
      const recentCadenceUsageFrequency = countRecent(recent, (item) => item.cadenceFingerprint === cadenceFingerprint);

      const assignment: VoiceAssignmentHistoryItem = {
        sessionSeed: params.sessionSeed,
        scenarioId: params.scenario.scenario_id,
        provider,
        voiceId,
        personaArchetype: archetype,
        cadenceFingerprint,
        openerCadencePattern,
        apologyRhythmPattern,
        closurePhrasingStyle,
        emotionalArcPattern,
        assignedAt: Date.now(),
        repeatCallerKey: repeatCallerConfig.repeatCallerKey,
      };
      persistAssignment(assignment);

      return {
        provider,
        voiceId,
        cadenceFingerprint,
        personaArchetype: archetype,
        openerCadencePattern,
        apologyRhythmPattern,
        closurePhrasingStyle,
        emotionalArcPattern,
        repeatCallerKey: repeatCallerConfig.repeatCallerKey,
        preserveCallerVoice: repeatCallerConfig.preserveCallerVoice,
        castingDiagnostics: {
          repeatCaller: Boolean(repeatCallerConfig.repeatCallerKey),
          recentVoiceUsageFrequency,
          recentProviderUsageFrequency,
          recentPersonaUsageFrequency,
          recentCadenceUsageFrequency,
          assignmentReasons: buildAssignmentReasons({
            archetype,
            recentVoiceUsage: recentVoiceUsageFrequency,
            recentProviderUsage: recentProviderUsageFrequency,
            repeatCaller: Boolean(repeatCallerConfig.repeatCallerKey),
            voiceHintApplied: Boolean(
              params.scenario.customer_persona.voice_hint?.presentation
              || params.scenario.customer_persona.voice_hint?.locale
              || params.scenario.customer_persona.voice_hint?.age_flavor,
            ),
          }),
          fallbackEvents: [...fallbackEvents],
        },
        providerCapabilities,
        adjustedSettings,
      };
    },
    recordFallbackEvent(event) {
      fallbackEvents.push(event);
      while (fallbackEvents.length > historyLimit) {
        fallbackEvents.shift();
      }
    },
    getRecentVoiceUsageFrequency(provider, voiceId) {
      return countRecent(recentHistory(), (item) => item.provider === provider && item.voiceId === voiceId);
    },
    getFallbackEvents() {
      return [...fallbackEvents];
    },
    reset() {
      history.length = 0;
      repeatCallerAssignments.clear();
      fallbackEvents.length = 0;
    },
  };
}

export const defaultVoiceCastingService = createVoiceCastingService();

export function recordVoiceFallbackEvent(event: VoiceFallbackEvent) {
  defaultVoiceCastingService.recordFallbackEvent(event);
}
