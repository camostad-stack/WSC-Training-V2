import { ENV } from "../../_core/env";
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

const ELEVENLABS_STUB_VOICES: VoiceProviderVoice[] = [
  {
    provider: "elevenlabs",
    voiceId: "elevenlabs-stub-neutral",
    displayName: "ElevenLabs Stub Neutral",
    locale: "en-US",
    traits: ["stub", "future-provider"],
  },
];

function buildCapabilities(): VoiceProviderCapabilities {
  return {
    provider: "elevenlabs",
    supportsStreaming: true,
    supportsEmotionControl: true,
    supportsSpeedControl: true,
    supportsStyleControl: true,
    supportsCustomVoices: true,
    supportsRealtimeNativeOutput: false,
    supportsWordTimestamps: true,
    defaultModel: "eleven_flash_v2_5",
    supportedModels: ["eleven_flash_v2_5", "eleven_multilingual_v2"],
    outputFormats: [buildDefaultOutputFormat("elevenlabs")],
  };
}

export function createElevenLabsVoiceAdapter(): VoiceProviderAdapter {
  const capabilities = buildCapabilities();

  return {
    provider: "elevenlabs",
    getCapabilities() {
      return capabilities;
    },
    async listAvailableVoices() {
      return ELEVENLABS_STUB_VOICES;
    },
    async synthesizeSpeech(_request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
      if (!ENV.elevenLabsApiKey) {
        throw new Error("ElevenLabs adapter is registered as a stub and is not configured yet.");
      }
      throw new Error("ElevenLabs adapter is not implemented yet.");
    },
    async streamSpeech(_request: VoiceStreamRequest): Promise<VoiceStreamResult> {
      if (!ENV.elevenLabsApiKey) {
        throw new Error("ElevenLabs adapter is registered as a stub and is not configured yet.");
      }
      throw new Error("ElevenLabs adapter is not implemented yet.");
    },
  };
}
