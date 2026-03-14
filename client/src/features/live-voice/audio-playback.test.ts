import { describe, expect, it, vi } from "vitest";

import type { CustomerVoiceCast } from "@/features/simulator/types";
import { playCustomerAudioTurn } from "./audio-playback";

function createVoiceCast(overrides: Partial<CustomerVoiceCast> = {}): CustomerVoiceCast {
  return {
    provider: "cartesia",
    voiceId: "cartesia-voice-1",
    sessionSeed: "session-seed",
    cadenceFingerprint: "skeptical-wary",
    personaArchetype: "calm_skeptical",
    openerCadencePattern: "skeptical-check-in",
    apologyRhythmPattern: "matter-of-fact",
    closurePhrasingStyle: "skeptical-last-check",
    emotionalArcPattern: "skeptical-until-specifics",
    pace: "steady",
    warmth: "neutral",
    sharpness: "balanced",
    energy: "medium",
    interruptionTendency: "situational",
    hesitationTendency: "light",
    verbosityTendency: "brief",
    ageFlavor: "adult",
    emotionalResponsiveness: "flexible",
    speechRate: 1,
    pitch: 1,
    stylePrompt: "Sound grounded.",
    emotionHint: "skeptical",
    providerModel: "test-model",
    fallbackProviders: ["openai-native-speech", "browser-native-speech"],
    providerCapabilities: {
      provider: "cartesia",
      supportsStreaming: true,
      supportsEmotionControl: true,
      supportsSpeedControl: true,
      supportsStyleControl: true,
      supportsCustomVoices: false,
      supportsRealtimeNativeOutput: false,
      supportsWordTimestamps: false,
      defaultModel: "test-model",
      supportedModels: ["test-model"],
      outputFormats: [{ container: "mp3", encoding: "mp3", mimeType: "audio/mpeg" }],
    },
    castingDiagnostics: {
      repeatCaller: false,
      recentVoiceUsageFrequency: 1,
      recentProviderUsageFrequency: 1,
      recentPersonaUsageFrequency: 1,
      recentCadenceUsageFrequency: 1,
      assignmentReasons: ["test"],
      fallbackEvents: [],
    },
    ...overrides,
  };
}

describe("playCustomerAudioTurn", () => {
  it("supports provider switching without changing the caller runtime contract", async () => {
    const speakNativeVoice = vi.fn(async () => undefined);
    const result = await playCustomerAudioTurn({
      message: "I still need to know what's happening.",
      voiceCast: createVoiceCast(),
      renderExternalSpeech: async () => ({
        provider: "openai-native-speech",
        voiceId: "alloy",
        contentType: "audio/mpeg",
        audioBase64: "ZmFrZQ==",
        didFallback: true,
        fallbackEvent: {
          fromProvider: "cartesia",
          toProvider: "openai-native-speech",
          reason: "cartesia timeout",
        },
      }),
      playRenderedAudio: async () => ({ started: true, completed: true }),
      speakNativeVoice,
      chooseNativeVoice: () => null,
    });

    expect(result.providerSelected).toBe("cartesia");
    expect(result.providerUsed).toBe("openai-native-speech");
    expect(result.playbackRoute).toBe("external-rendered");
    expect(result.fallbackTriggered).toBe(true);
    expect(result.logs.some((entry) => entry.type === "audio_provider_selected")).toBe(true);
    expect(result.logs.some((entry) => entry.type === "audio_provider_fallback")).toBe(true);
    expect(speakNativeVoice).not.toHaveBeenCalled();
  });

  it("falls back cleanly to native playback when the external renderer fails", async () => {
    const speakNativeVoice = vi.fn(async () => undefined);
    const result = await playCustomerAudioTurn({
      message: "Wait, who's actually handling this?",
      voiceCast: createVoiceCast(),
      allowBrowserNativeFallback: true,
      renderExternalSpeech: async () => {
        throw new Error("cartesia unavailable");
      },
      playRenderedAudio: async () => ({ started: false, completed: false, error: "should_not_run" }),
      speakNativeVoice,
      chooseNativeVoice: () => null,
    });

    expect(result.providerUsed).toBe("browser-native-speech");
    expect(result.playbackRoute).toBe("native-fallback");
    expect(result.fallbackTriggered).toBe(true);
    expect(result.fallbackReason).toContain("cartesia unavailable");
    expect(speakNativeVoice).toHaveBeenCalledTimes(1);
  });

  it("keeps playback alive by falling back to native voice when rendered audio cannot play", async () => {
    const speakNativeVoice = vi.fn(async () => undefined);
    const result = await playCustomerAudioTurn({
      message: "No, that still doesn't answer it.",
      voiceCast: createVoiceCast(),
      allowBrowserNativeFallback: true,
      renderExternalSpeech: async () => ({
        provider: "cartesia",
        voiceId: "cartesia-voice-1",
        contentType: "audio/mpeg",
        audioBase64: "ZmFrZQ==",
      }),
      playRenderedAudio: async () => ({ started: false, completed: false, error: "audio_element_error" }),
      speakNativeVoice,
      chooseNativeVoice: () => null,
    });

    expect(result.providerUsed).toBe("browser-native-speech");
    expect(result.playbackRoute).toBe("native-fallback");
    expect(result.fallbackReason).toBe("audio_element_error");
    expect(speakNativeVoice).toHaveBeenCalledTimes(1);
  });

  it("fails explicitly instead of silently downgrading to browser speech when browser fallback is disabled", async () => {
    const speakNativeVoice = vi.fn(async () => undefined);

    await expect(playCustomerAudioTurn({
      message: "I still need a real answer here.",
      voiceCast: createVoiceCast(),
      allowBrowserNativeFallback: false,
      renderExternalSpeech: async () => {
        throw new Error("cartesia unavailable");
      },
      playRenderedAudio: async () => ({ started: false, completed: false, error: "should_not_run" }),
      speakNativeVoice,
      chooseNativeVoice: () => null,
    })).rejects.toThrow("cartesia unavailable");

    expect(speakNativeVoice).not.toHaveBeenCalled();
  });
});
