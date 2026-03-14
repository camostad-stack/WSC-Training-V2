import type {
  CustomerVoiceCast,
  NormalizedVoiceRenderConfig,
  VoiceAudioContainer,
  VoiceAudioEncoding,
  VoiceEmotionalResponsiveness,
  VoiceEnergy,
  VoiceHesitationTendency,
  VoiceInterruptionTendency,
  VoiceOutputFormat,
  VoicePace,
  VoiceProfile,
  VoiceRenderProvider,
  VoiceSharpness,
  VoiceVerbosityTendency,
  VoiceWarmth,
} from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildDefaultOutputFormat(provider: VoiceRenderProvider): VoiceOutputFormat {
  switch (provider) {
    case "cartesia":
      return { container: "wav", encoding: "pcm_s16le", sampleRateHz: 24000, mimeType: "audio/wav" };
    case "browser-native-speech":
      return { container: "mp3", encoding: "mp3", mimeType: "audio/mpeg" };
    default:
      return { container: "mp3", encoding: "mp3", mimeType: "audio/mpeg" };
  }
}

export function mergeOutputFormat(
  base: VoiceOutputFormat,
  override?: Partial<VoiceOutputFormat>,
): VoiceOutputFormat {
  return {
    container: override?.container ?? base.container,
    encoding: override?.encoding ?? base.encoding,
    sampleRateHz: override?.sampleRateHz ?? base.sampleRateHz,
    mimeType: override?.mimeType ?? base.mimeType,
  };
}

function describePace(pace: VoicePace) {
  switch (pace) {
    case "slow":
      return "measured and slightly slower than average";
    case "brisk":
      return "brisk and quick to react";
    default:
      return "steady and natural";
  }
}

function describeWarmth(warmth: VoiceWarmth) {
  switch (warmth) {
    case "cool":
      return "cool rather than comforting";
    case "warm":
      return "warm and a little approachable";
    default:
      return "neutral and grounded";
  }
}

function describeSharpness(sharpness: VoiceSharpness) {
  switch (sharpness) {
    case "soft":
      return "soft around the edges";
    case "edgy":
      return "a little sharp or clipped";
    default:
      return "balanced and ordinary";
  }
}

function describeEnergy(energy: VoiceEnergy) {
  switch (energy) {
    case "low":
      return "low energy";
    case "high":
      return "high energy";
    default:
      return "moderate energy";
  }
}

function describeHesitation(hesitation: VoiceHesitationTendency) {
  switch (hesitation) {
    case "rare":
      return "confident with very little hesitation";
    case "noticeable":
      return "some audible hesitation and restarts";
    default:
      return "light hesitation when uncertain";
  }
}

function describeInterruption(interruption: VoiceInterruptionTendency) {
  switch (interruption) {
    case "rare":
      return "rarely interrupts";
    case "frequent":
      return "can cut in when frustrated or urgent";
    default:
      return "may interrupt if the employee sounds vague";
  }
}

function describeVerbosity(verbosity: VoiceVerbosityTendency) {
  switch (verbosity) {
    case "brief":
      return "brief spoken turns";
    case "expansive":
      return "more expansive spoken turns";
    default:
      return "balanced spoken turns";
  }
}

function describeResponsiveness(responsiveness: VoiceEmotionalResponsiveness) {
  switch (responsiveness) {
    case "restrained":
      return "emotionally restrained";
    case "volatile":
      return "emotionally reactive";
    default:
      return "emotionally responsive without overacting";
  }
}

export function buildStylePrompt(profile: VoiceProfile) {
  return [
    `Speak in a ${describePace(profile.pace)} rhythm.`,
    `Sound ${describeWarmth(profile.warmth)} and ${describeSharpness(profile.sharpness)}.`,
    `Carry ${describeEnergy(profile.energy)} with ${describeHesitation(profile.hesitationTendency)}.`,
    `Use ${describeVerbosity(profile.verbosityTendency)} and ${describeInterruption(profile.interruptionTendency)}.`,
    `Stay ${describeResponsiveness(profile.emotionalResponsiveness)}.`,
  ].join(" ");
}

export function buildEmotionHint(params: {
  warmth: VoiceWarmth;
  sharpness: VoiceSharpness;
  energy: VoiceEnergy;
  emotionalResponsiveness: VoiceEmotionalResponsiveness;
  hesitationTendency: VoiceHesitationTendency;
}) {
  const { warmth, sharpness, energy, emotionalResponsiveness, hesitationTendency } = params;
  if (energy === "high" && sharpness === "edgy") return "frustrated and urgent";
  if (hesitationTendency === "noticeable" && energy !== "high") return "uncertain and slightly guarded";
  if (warmth === "warm" && emotionalResponsiveness !== "volatile") return "warm but still invested in the answer";
  if (energy === "low" && emotionalResponsiveness === "restrained") return "tired and cautious";
  return "grounded and emotionally present";
}

export function inferSpeechRate(profile: Pick<VoiceProfile, "pace" | "energy" | "hesitationTendency">) {
  return clamp(
    0.92
      + (profile.pace === "brisk" ? 0.08 : 0)
      - (profile.pace === "slow" ? 0.08 : 0)
      + (profile.energy === "high" ? 0.03 : 0)
      - (profile.hesitationTendency === "noticeable" ? 0.04 : 0),
    0.78,
    1.14,
  );
}

export function inferPitch(profile: Pick<VoiceProfile, "warmth" | "sharpness" | "ageFlavor">) {
  return clamp(
    0.98
      + (profile.warmth === "warm" ? 0.04 : 0)
      - (profile.sharpness === "edgy" ? 0.05 : 0)
      + (profile.ageFlavor === "young_adult" ? 0.03 : 0)
      - (profile.ageFlavor === "older_adult" ? 0.04 : 0),
    0.78,
    1.18,
  );
}

export function normalizeVoiceConfig(params: {
  profile: VoiceProfile | CustomerVoiceCast;
  providerModel?: string;
  fallbackProviders?: VoiceRenderProvider[];
  outputFormat?: Partial<VoiceOutputFormat>;
}): NormalizedVoiceRenderConfig {
  const speechRate = "speechRate" in params.profile ? params.profile.speechRate : inferSpeechRate(params.profile);
  const pitch = "pitch" in params.profile ? params.profile.pitch : inferPitch(params.profile);
  const stylePrompt = "stylePrompt" in params.profile && params.profile.stylePrompt
    ? params.profile.stylePrompt
    : buildStylePrompt(params.profile);
  const emotionHint = "emotionHint" in params.profile && params.profile.emotionHint
    ? params.profile.emotionHint
    : buildEmotionHint(params.profile);

  return {
    ...params.profile,
    speechRate: Number(speechRate.toFixed(2)),
    pitch: Number(pitch.toFixed(2)),
    stylePrompt,
    emotionHint,
    providerModel: params.providerModel,
    fallbackProviders: params.fallbackProviders ?? ("fallbackProviders" in params.profile ? params.profile.fallbackProviders : []),
    outputFormat: mergeOutputFormat(buildDefaultOutputFormat(params.profile.provider), params.outputFormat),
  };
}

export function mapSpeechRateToProviderSpeed(speechRate: number) {
  return Number(clamp(speechRate, 0.65, 1.35).toFixed(2));
}

export function mapEnergyToProviderVolume(energy: VoiceEnergy) {
  switch (energy) {
    case "low":
      return 0.88;
    case "high":
      return 1.12;
    default:
      return 1;
  }
}

export function mapEmotionHintToCartesiaEmotion(config: Pick<
  NormalizedVoiceRenderConfig,
  "emotionHint" | "warmth" | "sharpness" | "energy" | "hesitationTendency"
>) {
  const normalized = `${config.emotionHint} ${config.warmth} ${config.sharpness} ${config.energy} ${config.hesitationTendency}`.toLowerCase();
  if (/urgent|frustrated|angry|edgy/.test(normalized)) return "frustrated";
  if (/guarded|hesitation|uncertain/.test(normalized)) return "hesitant";
  if (/warm/.test(normalized)) return "warm";
  if (/tired|low energy/.test(normalized)) return "calm";
  return "neutral";
}

export function mapOutputFormatForCartesia(format: VoiceOutputFormat) {
  const container = format.container === "pcm" ? "raw" : format.container;
  const encoding: VoiceAudioEncoding = format.encoding ?? (container === "raw" ? "pcm_s16le" : "pcm_s16le");
  return {
    container: container as VoiceAudioContainer | "raw",
    encoding,
    sample_rate: format.sampleRateHz ?? 24000,
  };
}

export async function* readableStreamToChunks(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
