import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import { createCartesiaVoiceAdapter } from "./cartesia-adapter";

describe("Cartesia voice adapter", () => {
  const originalApiKey = ENV.cartesiaApiKey;
  const originalBaseUrl = ENV.cartesiaBaseUrl;
  const originalVersion = ENV.cartesiaVersion;
  const originalModel = ENV.cartesiaModel;

  afterEach(() => {
    ENV.cartesiaApiKey = originalApiKey;
    ENV.cartesiaBaseUrl = originalBaseUrl;
    ENV.cartesiaVersion = originalVersion;
    ENV.cartesiaModel = originalModel;
    vi.restoreAllMocks();
  });

  it("maps normalized speed and emotion controls into Cartesia synthesis requests", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.cartesiaBaseUrl = "https://cartesia.example.com";
    ENV.cartesiaVersion = "2025-04-16";
    ENV.cartesiaModel = "sonic-3";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new TextEncoder().encode("wav").buffer,
    });

    const adapter = createCartesiaVoiceAdapter();
    const result = await adapter.synthesizeSpeech({
      text: "I still need the actual timeline.",
      config: {
        provider: "cartesia",
        voiceId: "voice-123",
        pace: "brisk",
        warmth: "neutral",
        sharpness: "edgy",
        energy: "high",
        interruptionTendency: "frequent",
        hesitationTendency: "light",
        verbosityTendency: "brief",
        ageFlavor: "adult",
        emotionalResponsiveness: "volatile",
        speechRate: 1.12,
        pitch: 1,
        stylePrompt: "brisk and skeptical",
        emotionHint: "frustrated and urgent",
        providerModel: "sonic-3",
        fallbackProviders: ["openai-native-speech"],
        outputFormat: { container: "wav", encoding: "pcm_s16le", sampleRateHz: 24000, mimeType: "audio/wav" },
      },
      fetchFn: fetchMock as typeof fetch,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(body.model_id).toBe("sonic-3");
    expect(body.voice.id).toBe("voice-123");
    expect(body.generation_config.speed).toBeGreaterThan(1);
    expect(body.generation_config.emotion).toBeTruthy();
    expect(result.provider).toBe("cartesia");
  });

  it("prepares websocket streaming metadata without leaking provider details into the caller contract", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.cartesiaBaseUrl = "https://cartesia.example.com";
    ENV.cartesiaVersion = "2025-04-16";

    const adapter = createCartesiaVoiceAdapter();
    const result = await adapter.streamSpeech({
      text: "Wait, so what am I supposed to do now?",
      contextId: "ctx-123",
      includeWordTimestamps: true,
      config: {
        provider: "cartesia",
        voiceId: "voice-123",
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
        stylePrompt: "steady and ordinary",
        emotionHint: "grounded",
        providerModel: "sonic-3",
        fallbackProviders: ["openai-native-speech"],
        outputFormat: { container: "wav", encoding: "pcm_s16le", sampleRateHz: 24000, mimeType: "audio/wav" },
      },
    });

    expect(result.protocol).toBe("websocket");
    expect(result.connection?.url).toBe("https://cartesia.example.com/tts/websocket");
    const body = JSON.parse(String(result.connection?.body || "{}"));
    expect(body.context_id).toBe("ctx-123");
    expect(body.add_timestamps).toBe(true);
    expect(body.generation_config.speed).toBe(1);
  });
});
