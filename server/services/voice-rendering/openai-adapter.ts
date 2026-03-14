import { ENV } from "../../_core/env";
import {
  buildDefaultOutputFormat,
  mapSpeechRateToProviderSpeed,
  normalizeVoiceConfig,
  readableStreamToChunks,
} from "./normalization";
import type {
  NormalizedVoiceRenderConfig,
  VoicePreparedConnection,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceProviderVoice,
  VoiceRenderProvider,
  VoiceStreamChunk,
  VoiceStreamRequest,
  VoiceStreamResult,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from "./types";

const OPENAI_NATIVE_VOICES: VoiceProviderVoice[] = [
  { provider: "openai-native-speech", voiceId: "alloy", displayName: "Alloy", locale: "en-US", genderFlavor: "neutral", traits: ["balanced", "neutral"] },
  { provider: "openai-native-speech", voiceId: "ash", displayName: "Ash", locale: "en-US", genderFlavor: "masculine", traits: ["calm", "grounded"] },
  { provider: "openai-native-speech", voiceId: "ballad", displayName: "Ballad", locale: "en-US", genderFlavor: "neutral", traits: ["measured", "storytelling"] },
  { provider: "openai-native-speech", voiceId: "coral", displayName: "Coral", locale: "en-US", genderFlavor: "feminine", traits: ["warm", "clear"] },
  { provider: "openai-native-speech", voiceId: "echo", displayName: "Echo", locale: "en-US", genderFlavor: "masculine", traits: ["direct", "clean"] },
  { provider: "openai-native-speech", voiceId: "fable", displayName: "Fable", locale: "en-US", genderFlavor: "neutral", traits: ["textured", "conversational"] },
  { provider: "openai-native-speech", voiceId: "nova", displayName: "Nova", locale: "en-US", genderFlavor: "feminine", traits: ["bright", "polished"] },
  { provider: "openai-native-speech", voiceId: "onyx", displayName: "Onyx", locale: "en-US", genderFlavor: "masculine", traits: ["steady", "low"] },
  { provider: "openai-native-speech", voiceId: "sage", displayName: "Sage", locale: "en-US", genderFlavor: "neutral", traits: ["measured", "professional"] },
  { provider: "openai-native-speech", voiceId: "shimmer", displayName: "Shimmer", locale: "en-US", genderFlavor: "feminine", traits: ["soft", "lively"] },
];

const OPENAI_REALTIME_VOICES: VoiceProviderVoice[] = [
  { provider: "openai-realtime-native", voiceId: "alloy", displayName: "Alloy", locale: "en-US", genderFlavor: "neutral", traits: ["balanced", "realtime"] },
  { provider: "openai-realtime-native", voiceId: "ash", displayName: "Ash", locale: "en-US", genderFlavor: "masculine", traits: ["grounded", "realtime"] },
  { provider: "openai-realtime-native", voiceId: "echo", displayName: "Echo", locale: "en-US", genderFlavor: "masculine", traits: ["direct", "realtime"] },
  { provider: "openai-realtime-native", voiceId: "sage", displayName: "Sage", locale: "en-US", genderFlavor: "neutral", traits: ["measured", "realtime"] },
  { provider: "openai-realtime-native", voiceId: "shimmer", displayName: "Shimmer", locale: "en-US", genderFlavor: "feminine", traits: ["warm", "realtime"] },
  { provider: "openai-realtime-native", voiceId: "verse", displayName: "Verse", locale: "en-US", genderFlavor: "neutral", traits: ["natural", "realtime"] },
];

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveOpenAIBaseUrl() {
  const raw = ENV.openaiSpeechBaseUrl || ENV.forgeApiUrl || "https://api.openai.com/v1";
  return ensureTrailingSlash(raw);
}

function resolveOpenAIKey() {
  return ENV.openaiApiKey || ENV.forgeApiKey;
}

function buildCapabilities(provider: VoiceRenderProvider): VoiceProviderCapabilities {
  return {
    provider,
    supportsStreaming: true,
    supportsEmotionControl: true,
    supportsSpeedControl: true,
    supportsStyleControl: true,
    supportsCustomVoices: false,
    supportsRealtimeNativeOutput: provider === "openai-realtime-native",
    supportsWordTimestamps: false,
    defaultModel: provider === "openai-realtime-native" ? ENV.realtimeModel : ENV.openaiSpeechModel,
    supportedModels: provider === "openai-realtime-native"
      ? [ENV.realtimeModel]
      : [ENV.openaiSpeechModel, "gpt-4o-mini-tts", "gpt-4o-tts"],
    outputFormats: [
      buildDefaultOutputFormat(provider),
      { container: "wav", encoding: "pcm_s16le", sampleRateHz: 24000, mimeType: "audio/wav" },
    ],
  };
}

function filterVoices(voices: VoiceProviderVoice[], search?: string) {
  if (!search) return voices;
  const normalized = search.toLowerCase();
  return voices.filter((voice) => `${voice.displayName} ${voice.voiceId} ${voice.traits.join(" ")}`.toLowerCase().includes(normalized));
}

function buildSpeechInstructions(config: NormalizedVoiceRenderConfig) {
  return [
    config.stylePrompt,
    `Emotion target: ${config.emotionHint}.`,
    `Approximate speaking speed: ${mapSpeechRateToProviderSpeed(config.speechRate)}x natural speed.`,
    "Use ordinary spoken language, natural contractions, and avoid sounding like a synthetic announcer.",
  ].join(" ");
}

async function readAudioResponse(response: Response) {
  const buffer = await response.arrayBuffer();
  return {
    audio: buffer,
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}

async function* responseToAudioChunks(response: Response): AsyncIterable<VoiceStreamChunk> {
  if (!response.body) {
    yield { type: "done" };
    return;
  }
  for await (const chunk of readableStreamToChunks(response.body as ReadableStream<Uint8Array>)) {
    yield { type: "audio", data: chunk };
  }
  yield { type: "done" };
}

export function createOpenAIVoiceAdapter(provider: "openai-native-speech" | "openai-realtime-native"): VoiceProviderAdapter {
  const capabilities = buildCapabilities(provider);
  const voices = provider === "openai-native-speech" ? OPENAI_NATIVE_VOICES : OPENAI_REALTIME_VOICES;

  return {
    provider,
    getCapabilities() {
      return capabilities;
    },
    async listAvailableVoices(params) {
      return filterVoices(voices, params?.search);
    },
    async synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
      const fetchFn = request.fetchFn ?? fetch;
      const apiKey = resolveOpenAIKey();
      if (!apiKey) {
        throw new Error(`OpenAI voice provider ${provider} is not configured.`);
      }
      const config = normalizeVoiceConfig({
        profile: request.config,
        providerModel: request.model || request.config.providerModel || capabilities.defaultModel,
        fallbackProviders: request.config.fallbackProviders,
        outputFormat: request.format,
      });
      const response = await fetchFn(new URL("audio/speech", resolveOpenAIBaseUrl()), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: request.model || config.providerModel || capabilities.defaultModel,
          voice: config.voiceId,
          input: request.text,
          response_format: config.outputFormat.container,
          instructions: buildSpeechInstructions(config),
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI voice synthesis failed (${response.status} ${response.statusText}).`);
      }

      const { audio, contentType } = await readAudioResponse(response);
      return {
        provider,
        voiceId: config.voiceId,
        model: request.model || config.providerModel || capabilities.defaultModel,
        contentType,
        audio,
        didFallback: false,
      };
    },
    async streamSpeech(request: VoiceStreamRequest): Promise<VoiceStreamResult> {
      const fetchFn = request.fetchFn ?? fetch;
      const apiKey = resolveOpenAIKey();
      if (!apiKey) {
        throw new Error(`OpenAI voice provider ${provider} is not configured.`);
      }
      const config = normalizeVoiceConfig({
        profile: request.config,
        providerModel: request.model || request.config.providerModel || capabilities.defaultModel,
        fallbackProviders: request.config.fallbackProviders,
      });
      const connection: VoicePreparedConnection = {
        protocol: "http-chunked",
        url: new URL("audio/speech", resolveOpenAIBaseUrl()).toString(),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: request.model || config.providerModel || capabilities.defaultModel,
          voice: config.voiceId,
          input: request.text,
          response_format: config.outputFormat.container,
          instructions: buildSpeechInstructions(config),
        }),
      };

      const response = await fetchFn(connection.url!, {
        method: "POST",
        headers: connection.headers,
        body: connection.body,
      });

      if (!response.ok) {
        throw new Error(`OpenAI voice stream failed (${response.status} ${response.statusText}).`);
      }

      return {
        provider,
        voiceId: config.voiceId,
        model: request.model || config.providerModel || capabilities.defaultModel,
        protocol: "http-chunked",
        connection,
        stream: responseToAudioChunks(response),
        didFallback: false,
      };
    },
  };
}
