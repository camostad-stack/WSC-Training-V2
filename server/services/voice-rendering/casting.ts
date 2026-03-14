import type { ScenarioDirectorResult } from "../ai/contracts";
import { ENV } from "../../_core/env";
import {
  buildEmotionHint,
  buildStylePrompt,
  inferPitch,
  inferSpeechRate,
} from "./normalization";
import { defaultVoiceCastingService } from "./service";
import { buildProviderPreferenceOrder, createVoiceProviderRegistry } from "./registry";
import type {
  CustomerVoiceCast,
  VoiceAgeFlavor,
  VoiceEmotionalResponsiveness,
  VoiceEnergy,
  VoiceHesitationTendency,
  VoiceInterruptionTendency,
  VoicePace,
  VoiceRenderProvider,
  VoiceSharpness,
  VoiceVerbosityTendency,
  VoiceWarmth,
} from "./types";

function inferAgeFlavor(ageBand?: string): VoiceAgeFlavor {
  const normalized = (ageBand || "").toLowerCase();
  if (/18|20|young/.test(normalized)) return "young_adult";
  if (/50|60|older|senior/.test(normalized)) return "older_adult";
  return "adult";
}

function inferWarmth(style: string, emotion: string): VoiceWarmth {
  const normalized = `${style} ${emotion}`.toLowerCase();
  if (/warm|friendly|chatty/.test(normalized)) return "warm";
  if (/cold|blunt|frustrated|angry|skeptical/.test(normalized)) return "cool";
  return "neutral";
}

function inferSharpness(style: string, emotion: string): VoiceSharpness {
  const normalized = `${style} ${emotion}`.toLowerCase();
  if (/sharp|edgy|blunt|angry|impatient/.test(normalized)) return "edgy";
  if (/calm|soft|gentle/.test(normalized)) return "soft";
  return "balanced";
}

function inferEnergy(style: string, emotion: string): VoiceEnergy {
  const normalized = `${style} ${emotion}`.toLowerCase();
  if (/urgent|alarmed|angry|frustrated|animated/.test(normalized)) return "high";
  if (/tired|flat|quiet|withdrawn/.test(normalized)) return "low";
  return "medium";
}

function inferPace(style: string, emotion: string): VoicePace {
  const normalized = `${style} ${emotion}`.toLowerCase();
  if (/urgent|impatient|direct|brisk/.test(normalized)) return "brisk";
  if (/measured|careful|hesitant|confused/.test(normalized)) return "slow";
  return "steady";
}

function inferInterruptionTendency(style: string, emotion: string): VoiceInterruptionTendency {
  const normalized = `${style} ${emotion}`.toLowerCase();
  if (/interrupt|impatient|urgent|skeptical/.test(normalized)) return "frequent";
  if (/warm|measured|calm/.test(normalized)) return "rare";
  return "situational";
}

function inferHesitationTendency(style: string, emotion: string): VoiceHesitationTendency {
  const normalized = `${style} ${emotion}`.toLowerCase();
  if (/confused|unsure|hesitant/.test(normalized)) return "noticeable";
  if (/direct|confident|blunt/.test(normalized)) return "rare";
  return "light";
}

function inferVerbosityTendency(style: string, scenarioFamily: string): VoiceVerbosityTendency {
  const normalized = `${style} ${scenarioFamily}`.toLowerCase();
  if (/organized|explainer|detailed|billing|parent/.test(normalized)) return "balanced";
  if (/urgent|emergency|skeptical|direct/.test(normalized)) return "brief";
  return "expansive";
}

function inferEmotionalResponsiveness(emotion: string, patience: string): VoiceEmotionalResponsiveness {
  const normalized = `${emotion} ${patience}`.toLowerCase();
  if (/angry|alarmed|low/.test(normalized)) return "volatile";
  if (/calm|high|patient/.test(normalized)) return "restrained";
  return "flexible";
}

export function createCustomerVoiceCast(params: {
  scenario: ScenarioDirectorResult;
  sessionSeed: string;
  preferredProvider?: VoiceRenderProvider;
  allowedProviders?: VoiceRenderProvider[];
}): CustomerVoiceCast {
  const persona = params.scenario.customer_persona;
  const style = persona.communication_style || "direct";
  const emotion = persona.initial_emotion || "concerned";
  const patience = persona.patience_level || "moderate";
  const ageFlavor = inferAgeFlavor(persona.age_band);
  const warmth = inferWarmth(style, emotion);
  const sharpness = inferSharpness(style, emotion);
  const energy = inferEnergy(style, emotion);
  const pace = inferPace(style, emotion);
  const interruptionTendency = inferInterruptionTendency(style, emotion);
  const hesitationTendency = inferHesitationTendency(style, emotion);
  const verbosityTendency = inferVerbosityTendency(style, params.scenario.scenario_family);
  const emotionalResponsiveness = inferEmotionalResponsiveness(emotion, patience);
  const registry = createVoiceProviderRegistry();
  const configuredProviders = Array.from(new Set([
    ...(params.allowedProviders && params.allowedProviders.length > 0
      ? params.allowedProviders
      : registry.listConfiguredProviders().filter(
        (candidate) => (
          (candidate !== "browser-native-speech" || !(ENV.forgeApiUrl && ENV.forgeApiKey))
          && (ENV.voiceRenderAllowBrowserNativeFallback || candidate !== "browser-native-speech")
        ),
      )),
    ...(params.preferredProvider ? [params.preferredProvider] : []),
  ]));
  const safeAvailableProviders = configuredProviders.length > 0
    ? configuredProviders
    : ["browser-native-speech" as const];
  const assignment = defaultVoiceCastingService.assignSessionIdentity({
    scenario: params.scenario,
    sessionSeed: params.sessionSeed,
    preferredProvider: params.preferredProvider,
    availableProviders: safeAvailableProviders,
    getProviderCapabilities: (candidate) => registry.getCapabilities(candidate),
    baseSettings: {
      ageFlavor,
      warmth,
      sharpness,
      energy,
      pace,
      interruptionTendency,
      hesitationTendency,
      verbosityTendency,
      emotionalResponsiveness,
    },
  });
  const provider = assignment.provider;
  const speechRate = inferSpeechRate({
    pace: assignment.adjustedSettings.pace,
    energy: assignment.adjustedSettings.energy,
    hesitationTendency: assignment.adjustedSettings.hesitationTendency,
  });
  const pitch = inferPitch({
    warmth: assignment.adjustedSettings.warmth,
    sharpness: assignment.adjustedSettings.sharpness,
    ageFlavor: assignment.adjustedSettings.ageFlavor,
  });
  const fallbackProviders = buildProviderPreferenceOrder({ preferredProvider: provider })
    .filter((candidate) => candidate !== provider)
    .filter((candidate) => ENV.voiceRenderAllowBrowserNativeFallback || candidate !== "browser-native-speech")
    .filter((candidate) => provider === "openai-realtime-native" || candidate !== "openai-realtime-native");

  return {
    provider,
    voiceId: assignment.voiceId,
    sessionSeed: params.sessionSeed,
    cadenceFingerprint: assignment.cadenceFingerprint,
    personaArchetype: assignment.personaArchetype,
    openerCadencePattern: assignment.openerCadencePattern,
    apologyRhythmPattern: assignment.apologyRhythmPattern,
    closurePhrasingStyle: assignment.closurePhrasingStyle,
    emotionalArcPattern: assignment.emotionalArcPattern,
    pace: assignment.adjustedSettings.pace,
    warmth: assignment.adjustedSettings.warmth,
    sharpness: assignment.adjustedSettings.sharpness,
    energy: assignment.adjustedSettings.energy,
    interruptionTendency: assignment.adjustedSettings.interruptionTendency,
    hesitationTendency: assignment.adjustedSettings.hesitationTendency,
    verbosityTendency: assignment.adjustedSettings.verbosityTendency,
    ageFlavor: assignment.adjustedSettings.ageFlavor,
    emotionalResponsiveness: assignment.adjustedSettings.emotionalResponsiveness,
    speechRate: Number(speechRate.toFixed(2)),
    pitch: Number(pitch.toFixed(2)),
    stylePrompt: buildStylePrompt({
      provider,
      voiceId: assignment.voiceId,
      pace: assignment.adjustedSettings.pace,
      warmth: assignment.adjustedSettings.warmth,
      sharpness: assignment.adjustedSettings.sharpness,
      energy: assignment.adjustedSettings.energy,
      interruptionTendency: assignment.adjustedSettings.interruptionTendency,
      hesitationTendency: assignment.adjustedSettings.hesitationTendency,
      verbosityTendency: assignment.adjustedSettings.verbosityTendency,
      ageFlavor: assignment.adjustedSettings.ageFlavor,
      emotionalResponsiveness: assignment.adjustedSettings.emotionalResponsiveness,
    }),
    emotionHint: buildEmotionHint({
      warmth: assignment.adjustedSettings.warmth,
      sharpness: assignment.adjustedSettings.sharpness,
      energy: assignment.adjustedSettings.energy,
      emotionalResponsiveness: assignment.adjustedSettings.emotionalResponsiveness,
      hesitationTendency: assignment.adjustedSettings.hesitationTendency,
    }),
    providerModel: assignment.providerCapabilities.defaultModel,
    fallbackProviders,
    providerCapabilities: assignment.providerCapabilities,
    repeatCallerKey: assignment.repeatCallerKey,
    preserveCallerVoice: assignment.preserveCallerVoice,
    castingDiagnostics: assignment.castingDiagnostics,
  };
}
