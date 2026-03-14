import { describe, expect, it, vi } from "vitest";
import {
  buildProviderPreferenceOrder,
  createVoiceProviderRegistry,
  listConfiguredVoiceProviders,
  renderSpeechWithFallback,
  streamSpeechWithFallback,
} from "./registry";
import type {
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceProviderVoice,
  VoiceRenderProvider,
  VoiceStreamRequest,
  VoiceStreamResult,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from "./types";

function createStubAdapter(params: {
  provider: VoiceRenderProvider;
  capabilities?: Partial<VoiceProviderCapabilities>;
  synthesizeSpeech?: (request: VoiceSynthesisRequest) => Promise<VoiceSynthesisResult>;
  streamSpeech?: (request: VoiceStreamRequest) => Promise<VoiceStreamResult>;
  voices?: VoiceProviderVoice[];
}): VoiceProviderAdapter {
  const capabilities: VoiceProviderCapabilities = {
    provider: params.provider,
    supportsStreaming: true,
    supportsEmotionControl: false,
    supportsSpeedControl: true,
    supportsStyleControl: false,
    supportsCustomVoices: false,
    supportsRealtimeNativeOutput: false,
    supportsWordTimestamps: false,
    defaultModel: `${params.provider}-model`,
    supportedModels: [`${params.provider}-model`],
    outputFormats: [{ container: "mp3", encoding: "mp3", mimeType: "audio/mpeg" }],
    ...params.capabilities,
  };

  return {
    provider: params.provider,
    getCapabilities() {
      return capabilities;
    },
    async listAvailableVoices() {
      return params.voices || [{
        provider: params.provider,
        voiceId: `${params.provider}-voice`,
        displayName: `${params.provider} voice`,
        locale: "en-US",
        traits: [],
      }];
    },
    async synthesizeSpeech(request) {
      if (params.synthesizeSpeech) return params.synthesizeSpeech(request);
      return {
        provider: params.provider,
        voiceId: request.config.voiceId,
        model: request.config.providerModel || `${params.provider}-model`,
        contentType: "audio/mpeg",
        audio: new TextEncoder().encode(params.provider).buffer,
        didFallback: false,
      };
    },
    async streamSpeech(request) {
      if (params.streamSpeech) return params.streamSpeech(request);
      return {
        provider: params.provider,
        voiceId: request.config.voiceId,
        model: request.config.providerModel || `${params.provider}-model`,
        protocol: "native",
        stream: (async function* () {
          yield { type: "done" as const };
        })(),
        didFallback: false,
      };
    },
  };
}

const baseConfig = {
  provider: "cartesia" as const,
  voiceId: "voice-1",
  pace: "steady" as const,
  warmth: "neutral" as const,
  sharpness: "balanced" as const,
  energy: "medium" as const,
  interruptionTendency: "situational" as const,
  hesitationTendency: "light" as const,
  verbosityTendency: "balanced" as const,
  ageFlavor: "adult" as const,
  emotionalResponsiveness: "flexible" as const,
  speechRate: 1,
  pitch: 1,
  stylePrompt: "steady and ordinary",
  emotionHint: "grounded",
  providerModel: "voice-model",
  fallbackProviders: ["openai-native-speech", "browser-native-speech"] as VoiceRenderProvider[],
  outputFormat: { container: "mp3" as const, encoding: "mp3" as const, mimeType: "audio/mpeg" },
};

describe("voice provider registry", () => {
  it("maps provider capabilities into a normalized registry surface", () => {
    const registry = createVoiceProviderRegistry();

    expect(registry.getCapabilities("cartesia").supportsCustomVoices).toBe(true);
    expect(registry.getCapabilities("cartesia").supportsWordTimestamps).toBe(true);
    expect(registry.getCapabilities("openai-native-speech").supportsEmotionControl).toBe(true);
    expect(registry.getCapabilities("openai-realtime-native").supportsRealtimeNativeOutput).toBe(true);
  });

  it("fails over to a secondary provider without changing the core request shape", async () => {
    const fallbackEvents: Array<{ fromProvider: VoiceRenderProvider; toProvider: VoiceRenderProvider; reason: string }> = [];
    const registry = createVoiceProviderRegistry({
      adapters: {
        cartesia: createStubAdapter({
          provider: "cartesia",
          synthesizeSpeech: async () => {
            throw new Error("cartesia is down");
          },
        }),
        "openai-native-speech": createStubAdapter({ provider: "openai-native-speech" }),
      },
    });

    const result = await renderSpeechWithFallback({
      registry,
      providerOrder: ["cartesia", "openai-native-speech"],
      request: {
        text: "Please stay on the line.",
        config: baseConfig,
      },
      onFallback: (event) => fallbackEvents.push(event),
    });

    expect(result.provider).toBe("openai-native-speech");
    expect(result.didFallback).toBe(true);
    expect(result.voiceId).not.toBe(baseConfig.voiceId);
    expect(fallbackEvents[0]).toMatchObject({
      fromProvider: "cartesia",
      toProvider: "openai-native-speech",
    });
  });

  it("can swap providers without any core runtime contract change", async () => {
    const registry = createVoiceProviderRegistry({
      adapters: {
        cartesia: createStubAdapter({ provider: "cartesia" }),
      },
    });

    const result = await renderSpeechWithFallback({
      registry,
      providerOrder: ["cartesia"],
      request: {
        text: "I still need to know what happens next.",
        config: baseConfig,
      },
    });

    expect(result.provider).toBe("cartesia");
    expect(new TextDecoder().decode(result.audio)).toBe("cartesia");
  });

  it("falls back during stream preparation too", async () => {
    const fallbackEvents: string[] = [];
    const registry = createVoiceProviderRegistry({
      adapters: {
        cartesia: createStubAdapter({
          provider: "cartesia",
          streamSpeech: async () => {
            throw new Error("stream handshake failed");
          },
        }),
        "openai-native-speech": createStubAdapter({ provider: "openai-native-speech" }),
      },
    });

    const result = await streamSpeechWithFallback({
      registry,
      providerOrder: ["cartesia", "openai-native-speech"],
      request: {
        text: "Checking that now.",
        config: baseConfig,
      },
      onFallback: (event) => fallbackEvents.push(`${event.fromProvider}->${event.toProvider}`),
    });

    expect(result.provider).toBe("openai-native-speech");
    expect(result.didFallback).toBe(true);
    expect(fallbackEvents).toContain("cartesia->openai-native-speech");
  });

  it("builds a stable provider preference order without duplicates", () => {
    const providers = buildProviderPreferenceOrder({
      preferredProvider: "cartesia",
      fallbackProviders: ["openai-native-speech", "cartesia", "browser-native-speech"],
    });

    expect(providers[0]).toBe("cartesia");
    expect(new Set(providers).size).toBe(providers.length);
    expect(providers).toContain("browser-native-speech");
  });

  it("always includes a local-safe browser fallback in configured providers", () => {
    expect(listConfiguredVoiceProviders()).toContain("browser-native-speech");
  });
});
