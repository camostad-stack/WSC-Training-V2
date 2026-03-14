import { buildDefaultOutputFormat } from "./normalization";
import type {
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceProviderVoice,
  VoiceStreamRequest,
  VoiceStreamResult,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from "./types";

const BROWSER_VOICES: VoiceProviderVoice[] = [
  { provider: "browser-native-speech", voiceId: "browser-warm-1", displayName: "Browser Warm 1", locale: "en-US", traits: ["browser", "warm"] },
  { provider: "browser-native-speech", voiceId: "browser-direct-1", displayName: "Browser Direct 1", locale: "en-US", traits: ["browser", "direct"] },
  { provider: "browser-native-speech", voiceId: "browser-measured-1", displayName: "Browser Measured 1", locale: "en-US", traits: ["browser", "measured"] },
  { provider: "browser-native-speech", voiceId: "browser-edgy-1", displayName: "Browser Edgy 1", locale: "en-US", traits: ["browser", "edgy"] },
];

const CAPABILITIES: VoiceProviderCapabilities = {
  provider: "browser-native-speech",
  supportsStreaming: false,
  supportsEmotionControl: false,
  supportsSpeedControl: true,
  supportsStyleControl: false,
  supportsCustomVoices: false,
  supportsRealtimeNativeOutput: true,
  supportsWordTimestamps: false,
  defaultModel: "browser-speech-synthesis",
  supportedModels: ["browser-speech-synthesis"],
  outputFormats: [buildDefaultOutputFormat("browser-native-speech")],
};

export function createBrowserVoiceAdapter(): VoiceProviderAdapter {
  return {
    provider: "browser-native-speech",
    getCapabilities() {
      return CAPABILITIES;
    },
    async listAvailableVoices() {
      return BROWSER_VOICES;
    },
    async synthesizeSpeech(_request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
      throw new Error("Browser-native speech is rendered on the client and is not available as a server synthesis adapter.");
    },
    async streamSpeech(_request: VoiceStreamRequest): Promise<VoiceStreamResult> {
      throw new Error("Browser-native speech does not support server-side streaming.");
    },
  };
}
