import type {
  VoiceProfile,
  VoiceProviderVoice,
  VoiceRenderProvider,
} from "./types";

const OPENAI_REALTIME_VOICES: readonly VoiceProviderVoice[] = [
  { provider: "openai-realtime-native", voiceId: "alloy", displayName: "Alloy", locale: "en-US", genderFlavor: "neutral", ageFlavor: "adult", traits: ["balanced", "neutral"] },
  { provider: "openai-realtime-native", voiceId: "ash", displayName: "Ash", locale: "en-US", genderFlavor: "masculine", ageFlavor: "adult", traits: ["grounded", "calm"] },
  { provider: "openai-realtime-native", voiceId: "echo", displayName: "Echo", locale: "en-US", genderFlavor: "masculine", ageFlavor: "adult", traits: ["direct", "clean"] },
  { provider: "openai-realtime-native", voiceId: "sage", displayName: "Sage", locale: "en-US", genderFlavor: "neutral", ageFlavor: "adult", traits: ["measured", "professional"] },
  { provider: "openai-realtime-native", voiceId: "shimmer", displayName: "Shimmer", locale: "en-US", genderFlavor: "feminine", ageFlavor: "adult", traits: ["warm", "soft"] },
  { provider: "openai-realtime-native", voiceId: "verse", displayName: "Verse", locale: "en-US", genderFlavor: "neutral", ageFlavor: "adult", traits: ["natural", "conversational"] },
];

const OPENAI_NATIVE_VOICES: readonly VoiceProviderVoice[] = [
  { provider: "openai-native-speech", voiceId: "alloy", displayName: "Alloy", locale: "en-US", genderFlavor: "neutral", ageFlavor: "adult", traits: ["balanced", "neutral"] },
  { provider: "openai-native-speech", voiceId: "ash", displayName: "Ash", locale: "en-US", genderFlavor: "masculine", ageFlavor: "adult", traits: ["calm", "grounded"] },
  { provider: "openai-native-speech", voiceId: "ballad", displayName: "Ballad", locale: "en-US", genderFlavor: "neutral", ageFlavor: "older_adult", traits: ["measured", "storytelling"] },
  { provider: "openai-native-speech", voiceId: "coral", displayName: "Coral", locale: "en-US", genderFlavor: "feminine", ageFlavor: "adult", traits: ["warm", "clear"] },
  { provider: "openai-native-speech", voiceId: "echo", displayName: "Echo", locale: "en-US", genderFlavor: "masculine", ageFlavor: "adult", traits: ["direct", "clean"] },
  { provider: "openai-native-speech", voiceId: "fable", displayName: "Fable", locale: "en-US", genderFlavor: "neutral", ageFlavor: "adult", traits: ["textured", "conversational"] },
  { provider: "openai-native-speech", voiceId: "nova", displayName: "Nova", locale: "en-US", genderFlavor: "feminine", ageFlavor: "young_adult", traits: ["bright", "polished"] },
  { provider: "openai-native-speech", voiceId: "onyx", displayName: "Onyx", locale: "en-US", genderFlavor: "masculine", ageFlavor: "older_adult", traits: ["steady", "low"] },
  { provider: "openai-native-speech", voiceId: "sage", displayName: "Sage", locale: "en-US", genderFlavor: "neutral", ageFlavor: "adult", traits: ["measured", "professional"] },
  { provider: "openai-native-speech", voiceId: "shimmer", displayName: "Shimmer", locale: "en-US", genderFlavor: "feminine", ageFlavor: "young_adult", traits: ["soft", "lively"] },
];

const CARTESIA_VOICES: readonly VoiceProviderVoice[] = [
  { provider: "cartesia", voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02", displayName: "Katie", locale: "en-US", genderFlavor: "feminine", ageFlavor: "adult", traits: ["warm", "expressive", "agentic"] },
  { provider: "cartesia", voiceId: "2282f2f8-cd08-4d0d-8a78-4d15c5f5a336", displayName: "Kiefer", locale: "en-US", genderFlavor: "masculine", ageFlavor: "adult", traits: ["grounded", "natural", "direct"] },
  { provider: "cartesia", voiceId: "6ccb0cb6-4fd8-4bcb-9084-67b378db2d86", displayName: "Tessa", locale: "en-US", genderFlavor: "feminine", ageFlavor: "young_adult", traits: ["bright", "casual", "quick"] },
  { provider: "cartesia", voiceId: "c961eb35-4e74-48a2-898c-baf0c3b3cf90", displayName: "Kyle", locale: "en-US", genderFlavor: "masculine", ageFlavor: "adult", traits: ["firm", "confident", "steady"] },
];

const BROWSER_NATIVE_VOICES: readonly VoiceProviderVoice[] = [
  { provider: "browser-native-speech", voiceId: "browser-warm-1", displayName: "Browser Warm", locale: "en-US", genderFlavor: "neutral", traits: ["warm", "browser"] },
  { provider: "browser-native-speech", voiceId: "browser-direct-1", displayName: "Browser Direct", locale: "en-US", genderFlavor: "neutral", traits: ["direct", "browser"] },
  { provider: "browser-native-speech", voiceId: "browser-measured-1", displayName: "Browser Measured", locale: "en-US", genderFlavor: "neutral", traits: ["measured", "browser"] },
  { provider: "browser-native-speech", voiceId: "browser-edgy-1", displayName: "Browser Edgy", locale: "en-US", genderFlavor: "neutral", traits: ["edgy", "browser"] },
];

const ELEVENLABS_STUB_VOICES: readonly VoiceProviderVoice[] = [
  { provider: "elevenlabs", voiceId: "elevenlabs-stub-neutral", displayName: "ElevenLabs Stub", locale: "en-US", genderFlavor: "neutral", traits: ["neutral", "stub"] },
];

const VOICE_CATALOG: Record<VoiceRenderProvider, readonly VoiceProviderVoice[]> = {
  "openai-realtime-native": OPENAI_REALTIME_VOICES,
  "openai-native-speech": OPENAI_NATIVE_VOICES,
  cartesia: CARTESIA_VOICES,
  elevenlabs: ELEVENLABS_STUB_VOICES,
  "browser-native-speech": BROWSER_NATIVE_VOICES,
};

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

export function buildProviderAgnosticVoiceSeed(profile: Pick<
  VoiceProfile,
  | "voiceId"
  | "pace"
  | "warmth"
  | "sharpness"
  | "energy"
  | "interruptionTendency"
  | "hesitationTendency"
  | "verbosityTendency"
  | "ageFlavor"
  | "emotionalResponsiveness"
>) {
  return [
    profile.voiceId,
    profile.pace,
    profile.warmth,
    profile.sharpness,
    profile.energy,
    profile.interruptionTendency,
    profile.hesitationTendency,
    profile.verbosityTendency,
    profile.ageFlavor,
    profile.emotionalResponsiveness,
  ].join(":");
}

export function listVoicesForProvider(provider: VoiceRenderProvider): readonly VoiceProviderVoice[] {
  return VOICE_CATALOG[provider];
}

export function selectVoiceIdForProvider(provider: VoiceRenderProvider, seed: string) {
  const sessionVariant = (hashText(seed) + hashText(`${reverseText(seed)}:voice`) * 7) >>> 0;
  const pool = listVoiceIdsForProvider(provider);
  return pool[sessionVariant % pool.length];
}

export function listVoiceIdsForProvider(provider: VoiceRenderProvider): readonly string[] {
  return listVoicesForProvider(provider).map((voice) => voice.voiceId);
}
