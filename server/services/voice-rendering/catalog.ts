import type { VoiceProfile, VoiceRenderProvider } from "./types";

const OPENAI_REALTIME_VOICE_IDS = ["alloy", "ash", "echo", "sage", "shimmer", "verse"] as const;
const OPENAI_NATIVE_VOICE_IDS = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"] as const;
const CARTESIA_VOICE_IDS = [
  "f786b574-daa5-4673-aa0c-cbe3e8534c02",
  "2282f2f8-cd08-4d0d-8a78-4d15c5f5a336",
  "6ccb0cb6-4fd8-4bcb-9084-67b378db2d86",
  "c961eb35-4e74-48a2-898c-baf0c3b3cf90",
] as const;
const BROWSER_VOICE_IDS = ["browser-warm-1", "browser-direct-1", "browser-measured-1", "browser-edgy-1"] as const;
const ELEVENLABS_STUB_VOICE_IDS = ["elevenlabs-stub-neutral"] as const;

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

export function selectVoiceIdForProvider(provider: VoiceRenderProvider, seed: string) {
  const sessionVariant = (hashText(seed) + hashText(`${reverseText(seed)}:voice`) * 7) >>> 0;
  const pool = listVoiceIdsForProvider(provider);
  return pool[sessionVariant % pool.length];
}

export function listVoiceIdsForProvider(provider: VoiceRenderProvider): readonly string[] {
  const pools: Record<VoiceRenderProvider, readonly string[]> = {
    "openai-realtime-native": OPENAI_REALTIME_VOICE_IDS,
    "openai-native-speech": OPENAI_NATIVE_VOICE_IDS,
    cartesia: CARTESIA_VOICE_IDS,
    elevenlabs: ELEVENLABS_STUB_VOICE_IDS,
    "browser-native-speech": BROWSER_VOICE_IDS,
  };
  return pools[provider];
}
