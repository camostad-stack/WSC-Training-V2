import { ENV } from "../../_core/env";
import {
  buildDefaultOutputFormat,
  mapEmotionHintToCartesiaEmotion,
  mapEnergyToProviderVolume,
  mapOutputFormatForCartesia,
  mapSpeechRateToProviderSpeed,
  normalizeVoiceConfig,
} from "./normalization";
import type {
  VoicePreparedConnection,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceProviderVoice,
  VoiceStreamRequest,
  VoiceStreamResult,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from "./types";

const CURATED_CARTESIA_VOICES: VoiceProviderVoice[] = [
  {
    provider: "cartesia",
    voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    displayName: "Katie",
    locale: "en-US",
    genderFlavor: "feminine",
    ageFlavor: "adult",
    traits: ["warm", "expressive", "agentic"],
  },
  {
    provider: "cartesia",
    voiceId: "2282f2f8-cd08-4d0d-8a78-4d15c5f5a336",
    displayName: "Kiefer",
    locale: "en-US",
    genderFlavor: "masculine",
    ageFlavor: "adult",
    traits: ["grounded", "natural", "direct"],
  },
  {
    provider: "cartesia",
    voiceId: "6ccb0cb6-4fd8-4bcb-9084-67b378db2d86",
    displayName: "Tessa",
    locale: "en-US",
    genderFlavor: "feminine",
    ageFlavor: "young_adult",
    traits: ["bright", "casual", "quick"],
  },
  {
    provider: "cartesia",
    voiceId: "c961eb35-4e74-48a2-898c-baf0c3b3cf90",
    displayName: "Kyle",
    locale: "en-US",
    genderFlavor: "masculine",
    ageFlavor: "adult",
    traits: ["firm", "confident", "steady"],
  },
];

function resolveCartesiaBaseUrl() {
  return (ENV.cartesiaBaseUrl || "https://api.cartesia.ai").replace(/\/$/, "");
}

function resolveHeaders() {
  if (!ENV.cartesiaApiKey) {
    throw new Error("Cartesia voice provider is not configured.");
  }
  return {
    "X-API-Key": ENV.cartesiaApiKey,
    "Cartesia-Version": ENV.cartesiaVersion,
    "content-type": "application/json",
  };
}

function buildCapabilities(): VoiceProviderCapabilities {
  return {
    provider: "cartesia",
    supportsStreaming: true,
    supportsEmotionControl: true,
    supportsSpeedControl: true,
    supportsStyleControl: true,
    supportsCustomVoices: true,
    supportsRealtimeNativeOutput: false,
    supportsWordTimestamps: true,
    defaultModel: ENV.cartesiaModel,
    supportedModels: [ENV.cartesiaModel, "sonic-2", "sonic-3"],
    outputFormats: [
      buildDefaultOutputFormat("cartesia"),
      { container: "raw", encoding: "pcm_s16le", sampleRateHz: 24000, mimeType: "audio/raw" },
    ],
  };
}

function filterVoices(voices: VoiceProviderVoice[], search?: string) {
  if (!search) return voices;
  const normalized = search.toLowerCase();
  return voices.filter((voice) => `${voice.displayName} ${voice.voiceId} ${voice.traits.join(" ")}`.toLowerCase().includes(normalized));
}

function buildCartesiaBody(request: VoiceSynthesisRequest | VoiceStreamRequest) {
  const config = normalizeVoiceConfig({
    profile: request.config,
    providerModel: request.model || request.config.providerModel || ENV.cartesiaModel,
    fallbackProviders: request.config.fallbackProviders,
  });
  return {
    model_id: request.model || config.providerModel || ENV.cartesiaModel,
    transcript: request.text,
    voice: {
      mode: "id",
      id: config.voiceId,
    },
    language: request.language || "en",
    output_format: mapOutputFormatForCartesia(config.outputFormat),
    generation_config: {
      speed: mapSpeechRateToProviderSpeed(config.speechRate),
      emotion: mapEmotionHintToCartesiaEmotion(config),
      volume: mapEnergyToProviderVolume(config.energy),
    },
  };
}

export function createCartesiaVoiceAdapter(): VoiceProviderAdapter {
  const capabilities = buildCapabilities();

  return {
    provider: "cartesia",
    getCapabilities() {
      return capabilities;
    },
    async listAvailableVoices(params) {
      if (!ENV.cartesiaApiKey || !params?.fetchFn) {
        return filterVoices(CURATED_CARTESIA_VOICES, params?.search);
      }

      const response = await params.fetchFn(`${resolveCartesiaBaseUrl()}/voices`, {
        method: "GET",
        headers: resolveHeaders(),
      });

      if (!response.ok) {
        return filterVoices(CURATED_CARTESIA_VOICES, params?.search);
      }

      const json = await response.json() as { voices?: Array<{ id: string; name: string; language?: string; description?: string }> };
      const voices = (json.voices || []).map((voice) => ({
        provider: "cartesia" as const,
        voiceId: voice.id,
        displayName: voice.name,
        locale: voice.language || "en-US",
        traits: [voice.description || "custom"].filter(Boolean),
        custom: true,
      }));
      return filterVoices(voices.length > 0 ? voices : CURATED_CARTESIA_VOICES, params?.search);
    },
    async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
      const fetchFn = request.fetchFn ?? fetch;
      const body = buildCartesiaBody(request);
      const response = await fetchFn(`${resolveCartesiaBaseUrl()}/tts/bytes`, {
        method: "POST",
        headers: resolveHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Cartesia voice synthesis failed (${response.status} ${response.statusText}).`);
      }

      return {
        provider: "cartesia",
        voiceId: body.voice.id,
        model: String(body.model_id),
        contentType: response.headers.get("content-type") || "audio/wav",
        audio: await response.arrayBuffer(),
        didFallback: false,
      };
    },
    async streamSpeech(request: VoiceStreamRequest): Promise<VoiceStreamResult> {
      const body = buildCartesiaBody(request);
      const headers = resolveHeaders();
      const connection: VoicePreparedConnection = {
        protocol: "websocket",
        url: `${resolveCartesiaBaseUrl()}/tts/websocket`,
        headers: {
          "X-API-Key": headers["X-API-Key"],
          "Cartesia-Version": headers["Cartesia-Version"],
        },
        body: JSON.stringify({
          ...body,
          context_id: request.contextId,
          add_timestamps: Boolean(request.includeWordTimestamps),
        }),
      };

      return {
        provider: "cartesia",
        voiceId: body.voice.id,
        model: String(body.model_id),
        protocol: "websocket",
        connection,
        didFallback: false,
      };
    },
  };
}
