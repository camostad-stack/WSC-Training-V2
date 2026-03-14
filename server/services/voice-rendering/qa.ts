import { normalizeVoiceConfig } from "./normalization";
import {
  buildProviderPreferenceOrder,
  createVoiceProviderRegistry,
  renderSpeechWithFallback,
} from "./registry";
import type {
  CustomerVoiceCast,
  VoiceAbComparison,
  VoiceAbComparisonSample,
  VoiceRenderDiagnostics,
  VoiceRenderProvider,
  VoiceSynthesisRequest,
} from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function countRepeatedBigrams(text: string) {
  const tokens = text.toLowerCase().split(/\s+/).map((token) => token.replace(/[^a-z0-9']/g, "")).filter(Boolean);
  const counts = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = `${tokens[index]} ${tokens[index + 1]}`;
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }
  return Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function baseNaturalness(provider: VoiceRenderProvider) {
  switch (provider) {
    case "cartesia":
      return 90;
    case "openai-native-speech":
      return 82;
    case "openai-realtime-native":
      return 74;
    case "elevenlabs":
      return 86;
    default:
      return 58;
  }
}

function buildQualityScores(params: {
  provider: VoiceRenderProvider;
  text: string;
  cast: CustomerVoiceCast;
  latencyMs: number;
}) {
  const repeatedBigrams = countRepeatedBigrams(params.text);
  const naturalness = clamp(
    baseNaturalness(params.provider)
      + (params.cast.providerCapabilities.supportsStyleControl ? 4 : 0)
      + (params.cast.providerCapabilities.supportsEmotionControl ? 3 : 0)
      - (params.latencyMs > 1200 ? 6 : 0),
    0,
    100,
  );
  const phraseRepetitionRisk = clamp(
    18
      + repeatedBigrams * 18
      + (params.cast.verbosityTendency === "expansive" ? 6 : 0)
      - (params.provider === "cartesia" ? 4 : 0),
    0,
    100,
  );
  const emotionalRealism = clamp(
    62
      + (params.cast.providerCapabilities.supportsEmotionControl ? 18 : 0)
      + (params.cast.emotionalResponsiveness === "volatile" ? 8 : params.cast.emotionalResponsiveness === "flexible" ? 5 : 0)
      + (params.provider === "cartesia" ? 8 : 0),
    0,
    100,
  );
  const interruptionRecovery = clamp(
    54
      + (params.cast.providerCapabilities.supportsStreaming ? 20 : 0)
      + (params.latencyMs < 900 ? 10 : 0)
      + (params.provider === "cartesia" ? 6 : 0),
    0,
    100,
  );
  return {
    naturalness,
    phraseRepetitionRisk,
    emotionalRealism,
    interruptionRecovery,
  };
}

function buildDiagnosticNotes(params: {
  provider: VoiceRenderProvider;
  latencyMs: number;
  text: string;
  cast: CustomerVoiceCast;
}) {
  const notes: string[] = [];
  if (params.provider === "cartesia") {
    notes.push("Cartesia is active as the external renderer for this sample.");
  }
  if (params.latencyMs > 1200) {
    notes.push("Latency is elevated for a live call and may affect perceived interruption recovery.");
  }
  if (countRepeatedBigrams(params.text) > 0) {
    notes.push("The underlying actor text contains repeated phrasing; compare whether the renderer still sounds varied.");
  }
  if (!params.cast.providerCapabilities.supportsEmotionControl) {
    notes.push("Provider cannot directly steer emotion, so emotional realism depends more heavily on prompt text.");
  }
  return notes;
}

function normalizeProviderOrder(params: {
  cast: CustomerVoiceCast;
  providerOrder?: VoiceRenderProvider[];
}) {
  const providers = params.providerOrder && params.providerOrder.length > 0
    ? params.providerOrder
    : buildProviderPreferenceOrder({
    preferredProvider: params.cast.provider,
    fallbackProviders: params.cast.fallbackProviders,
  });
  return providers
    .filter((provider) => provider !== "browser-native-speech")
    .filter((provider) => params.cast.provider === "openai-realtime-native" || provider !== "openai-realtime-native");
}

export async function renderVoiceLineWithDiagnostics(params: {
  text: string;
  cast: CustomerVoiceCast;
  fetchFn?: typeof fetch;
  providerOrder?: VoiceRenderProvider[];
}) {
  const startedAt = Date.now();
  const result = await renderSpeechWithFallback({
    request: {
      text: params.text,
      config: normalizeVoiceConfig({
        profile: params.cast,
        providerModel: params.cast.providerModel,
        fallbackProviders: params.cast.fallbackProviders,
      }),
      fetchFn: params.fetchFn,
    },
    providerOrder: normalizeProviderOrder({
      cast: params.cast,
      providerOrder: params.providerOrder,
    }),
  });
  const latencyMs = Date.now() - startedAt;
  const diagnostics: VoiceRenderDiagnostics = {
    provider: result.provider,
    voiceId: result.voiceId,
    renderMode: "synthesized",
    latencyMs,
    didFallback: result.didFallback,
    fallbackEvent: result.fallbackEvent,
    quality: buildQualityScores({
      provider: result.provider,
      text: params.text,
      cast: {
        ...params.cast,
        provider: result.provider,
      },
      latencyMs,
    }),
    notes: buildDiagnosticNotes({
      provider: result.provider,
      latencyMs,
      text: params.text,
      cast: params.cast,
    }),
  };

  return {
    synthesis: result,
    diagnostics,
  };
}

export async function compareVoiceProvidersForLine(params: {
  text: string;
  cast: CustomerVoiceCast;
  providers: VoiceRenderProvider[];
  fetchFn?: typeof fetch;
  fallbackProviders?: VoiceRenderProvider[];
  baselineProvider?: VoiceRenderProvider;
}): Promise<VoiceAbComparison> {
  const registry = createVoiceProviderRegistry();
  const samples: VoiceAbComparisonSample[] = [];
  const providers = Array.from(new Set(params.providers.filter((provider) => provider !== "browser-native-speech")));
  for (const provider of providers) {
    const startedAt = Date.now();
    const result = await renderSpeechWithFallback({
      request: {
        text: params.text,
        config: normalizeVoiceConfig({
          profile: {
            ...params.cast,
            provider,
          },
          providerModel: registry.getCapabilities(provider).defaultModel,
          fallbackProviders: params.fallbackProviders ?? params.cast.fallbackProviders,
        }),
        fetchFn: params.fetchFn,
      },
      providerOrder: [provider, ...(params.fallbackProviders ?? params.cast.fallbackProviders)],
    });
    const latencyMs = Date.now() - startedAt;
    samples.push({
      requestedProvider: provider,
      finalProvider: result.provider,
      voiceId: result.voiceId,
      didFallback: result.didFallback,
      fallbackEvent: result.fallbackEvent,
      diagnostics: {
        provider: result.provider,
        voiceId: result.voiceId,
        renderMode: "synthesized",
        latencyMs,
        didFallback: result.didFallback,
        fallbackEvent: result.fallbackEvent,
        quality: buildQualityScores({
          provider: result.provider,
          text: params.text,
          cast: {
            ...params.cast,
            provider: result.provider,
          },
          latencyMs,
        }),
        notes: buildDiagnosticNotes({
          provider: result.provider,
          latencyMs,
          text: params.text,
          cast: params.cast,
        }),
      },
    });
  }

  return {
    text: params.text,
    baselineProvider: params.baselineProvider ?? providers[0],
    samples,
  };
}
