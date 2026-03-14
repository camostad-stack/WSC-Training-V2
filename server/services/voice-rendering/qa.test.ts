import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import { compareVoiceProvidersForLine, renderVoiceLineWithDiagnostics } from "./qa";
import type { CustomerVoiceCast } from "./types";

const baseCast: CustomerVoiceCast = {
  provider: "cartesia",
  voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
  sessionSeed: "qa-seed",
  cadenceFingerprint: "steady-with-light-hesitation",
  personaArchetype: "calm_skeptical",
  openerCadencePattern: "skeptical-check-in",
  apologyRhythmPattern: "matter-of-fact",
  closurePhrasingStyle: "guarded-acceptance",
  emotionalArcPattern: "skeptical-until-specifics",
  pace: "steady",
  warmth: "neutral",
  sharpness: "balanced",
  energy: "medium",
  interruptionTendency: "situational",
  hesitationTendency: "light",
  verbosityTendency: "balanced",
  ageFlavor: "adult",
  emotionalResponsiveness: "flexible",
  speechRate: 1,
  pitch: 1,
  stylePrompt: "Speak in an ordinary, skeptical rhythm.",
  emotionHint: "grounded and a little wary",
  providerModel: "sonic-3",
  fallbackProviders: ["openai-native-speech"],
  providerCapabilities: {
    provider: "cartesia",
    supportsStreaming: true,
    supportsEmotionControl: true,
    supportsSpeedControl: true,
    supportsStyleControl: true,
    supportsCustomVoices: true,
    supportsRealtimeNativeOutput: false,
    supportsWordTimestamps: true,
    defaultModel: "sonic-3",
    supportedModels: ["sonic-3"],
    outputFormats: [{ container: "wav", encoding: "pcm_s16le", sampleRateHz: 24000, mimeType: "audio/wav" }],
  },
  castingDiagnostics: {
    repeatCaller: false,
    recentVoiceUsageFrequency: 0,
    recentProviderUsageFrequency: 0,
    recentPersonaUsageFrequency: 0,
    recentCadenceUsageFrequency: 0,
    assignmentReasons: ["qa"],
    fallbackEvents: [],
  },
};

describe("voice rendering QA diagnostics", () => {
  const originalCartesiaApiKey = ENV.cartesiaApiKey;
  const originalOpenaiApiKey = ENV.openaiApiKey;

  afterEach(() => {
    ENV.cartesiaApiKey = originalCartesiaApiKey;
    ENV.openaiApiKey = originalOpenaiApiKey;
    vi.restoreAllMocks();
  });

  it("renders the active line through the current provider and returns diagnostics", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new TextEncoder().encode("cartesia-audio").buffer,
    });

    const result = await renderVoiceLineWithDiagnostics({
      text: "Okay, but I still need to know what happens next.",
      cast: baseCast,
      fetchFn: fetchMock as typeof fetch,
    });

    expect(result.synthesis.provider).toBe("cartesia");
    expect(result.diagnostics.provider).toBe("cartesia");
    expect(result.diagnostics.quality.naturalness).toBeGreaterThan(80);
    expect(result.diagnostics.notes[0]).toContain("Cartesia");
  });

  it("can compare Cartesia and OpenAI-native against the same actor line for QA", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.openaiApiKey = "openai-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cartesia")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "audio/wav" }),
          arrayBuffer: async () => new TextEncoder().encode("cartesia-audio").buffer,
        };
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "audio/mpeg" }),
        arrayBuffer: async () => new TextEncoder().encode("openai-audio").buffer,
      };
    });

    const comparison = await compareVoiceProvidersForLine({
      text: "No, that's still vague. Who exactly is following up?",
      cast: baseCast,
      providers: ["cartesia", "openai-native-speech"],
      fetchFn: fetchMock as typeof fetch,
      baselineProvider: "openai-native-speech",
    });

    expect(comparison.baselineProvider).toBe("openai-native-speech");
    expect(comparison.samples).toHaveLength(2);
    expect(comparison.samples.map((sample) => sample.requestedProvider)).toEqual(["cartesia", "openai-native-speech"]);
    expect(comparison.samples.every((sample) => sample.diagnostics.latencyMs >= 0)).toBe(true);
  });
});
