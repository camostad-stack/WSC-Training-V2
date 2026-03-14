import { ENV } from "../../_core/env";
import { createBrowserVoiceAdapter } from "./browser-adapter";
import { buildProviderAgnosticVoiceSeed, selectVoiceIdForProvider } from "./catalog";
import { createCartesiaVoiceAdapter } from "./cartesia-adapter";
import { createElevenLabsVoiceAdapter } from "./elevenlabs-adapter";
import { createOpenAIVoiceAdapter } from "./openai-adapter";
import { recordVoiceFallbackEvent } from "./service";
import type {
  NormalizedVoiceRenderConfig,
  VoiceFallbackEvent,
  VoicePreparedConnection,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceRenderProvider,
  VoiceStreamRequest,
  VoiceStreamResult,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from "./types";

const VOICE_PROVIDER_SET = new Set<VoiceRenderProvider>([
  "openai-realtime-native",
  "openai-native-speech",
  "cartesia",
  "elevenlabs",
  "browser-native-speech",
]);

export interface VoiceProviderRegistry {
  getAdapter(provider: VoiceRenderProvider): VoiceProviderAdapter;
  getCapabilities(provider: VoiceRenderProvider): VoiceProviderCapabilities;
  listConfiguredProviders(): VoiceRenderProvider[];
  listAllProviders(): VoiceRenderProvider[];
}

export interface RenderSpeechWithFallbackParams {
  request: VoiceSynthesisRequest;
  providerOrder: VoiceRenderProvider[];
  registry?: VoiceProviderRegistry;
  onFallback?: (event: VoiceFallbackEvent) => void;
}

export interface StreamSpeechWithFallbackParams {
  request: VoiceStreamRequest;
  providerOrder: VoiceRenderProvider[];
  registry?: VoiceProviderRegistry;
  onFallback?: (event: VoiceFallbackEvent) => void;
}

function uniqueProviders(providers: VoiceRenderProvider[]) {
  return Array.from(new Set(providers));
}

export function parseVoiceProviderList(raw?: string | null): VoiceRenderProvider[] {
  if (!raw) return [];
  return uniqueProviders(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is VoiceRenderProvider => VOICE_PROVIDER_SET.has(value as VoiceRenderProvider)),
  );
}

function defaultAdapters(): Record<VoiceRenderProvider, VoiceProviderAdapter> {
  return {
    "openai-realtime-native": createOpenAIVoiceAdapter("openai-realtime-native"),
    "openai-native-speech": createOpenAIVoiceAdapter("openai-native-speech"),
    cartesia: createCartesiaVoiceAdapter(),
    elevenlabs: createElevenLabsVoiceAdapter(),
    "browser-native-speech": createBrowserVoiceAdapter(),
  };
}

export function listConfiguredVoiceProviders(): VoiceRenderProvider[] {
  const providers: VoiceRenderProvider[] = [];
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    providers.push("openai-realtime-native");
  }
  if (ENV.openaiApiKey || ENV.forgeApiKey) {
    providers.push("openai-native-speech");
  }
  if (ENV.cartesiaApiKey) {
    providers.push("cartesia");
  }
  if (ENV.elevenLabsApiKey) {
    providers.push("elevenlabs");
  }
  providers.push("browser-native-speech");
  return uniqueProviders(providers);
}

export function createVoiceProviderRegistry(overrides?: {
  adapters?: Partial<Record<VoiceRenderProvider, VoiceProviderAdapter>>;
}): VoiceProviderRegistry {
  const adapters = {
    ...defaultAdapters(),
    ...(overrides?.adapters || {}),
  } as Record<VoiceRenderProvider, VoiceProviderAdapter>;

  return {
    getAdapter(provider) {
      const adapter = adapters[provider];
      if (!adapter) {
        throw new Error(`No voice adapter registered for ${provider}.`);
      }
      return adapter;
    },
    getCapabilities(provider) {
      return this.getAdapter(provider).getCapabilities();
    },
    listConfiguredProviders() {
      return listConfiguredVoiceProviders();
    },
    listAllProviders() {
      return Object.keys(adapters) as VoiceRenderProvider[];
    },
  };
}

function buildFallbackEvent(params: {
  fromProvider: VoiceRenderProvider;
  toProvider: VoiceRenderProvider;
  reason: string;
  config?: NormalizedVoiceRenderConfig;
}): VoiceFallbackEvent {
  return {
    fromProvider: params.fromProvider,
    toProvider: params.toProvider,
    reason: params.reason,
    attemptedVoiceId: params.config?.voiceId,
  };
}

function remapConfigForProvider(
  config: NormalizedVoiceRenderConfig,
  provider: VoiceRenderProvider,
  registry: VoiceProviderRegistry,
): NormalizedVoiceRenderConfig {
  if (config.provider === provider) {
    return config;
  }

  const capabilities = registry.getCapabilities(provider);
  return {
    ...config,
    provider,
    voiceId: selectVoiceIdForProvider(provider, buildProviderAgnosticVoiceSeed(config)),
    providerModel: capabilities.defaultModel,
  };
}

export async function renderSpeechWithFallback(params: RenderSpeechWithFallbackParams): Promise<VoiceSynthesisResult> {
  const registry = params.registry ?? createVoiceProviderRegistry();
  const providerOrder = uniqueProviders(params.providerOrder);
  const errors: string[] = [];

  for (let index = 0; index < providerOrder.length; index += 1) {
    const provider = providerOrder[index];
    const adapter = registry.getAdapter(provider);

    try {
      const result = await adapter.synthesizeSpeech({
        ...params.request,
        config: remapConfigForProvider(params.request.config, provider, registry),
      });
      if (index === 0) {
        return result;
      }
      const fallbackEvent = buildFallbackEvent({
        fromProvider: providerOrder[0],
        toProvider: provider,
        reason: errors.join(" | "),
        config: params.request.config,
      });
      params.onFallback?.(fallbackEvent);
      return {
        ...result,
        didFallback: true,
        fallbackEvent,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (index < providerOrder.length - 1) {
        const fallbackEvent = buildFallbackEvent({
          fromProvider: provider,
          toProvider: providerOrder[index + 1],
          reason: errors[errors.length - 1],
          config: params.request.config,
        });
        recordVoiceFallbackEvent(fallbackEvent);
        params.onFallback?.(fallbackEvent);
      }
    }
  }

  throw new Error(`All voice providers failed: ${errors.join(" | ")}`);
}

export async function streamSpeechWithFallback(params: StreamSpeechWithFallbackParams): Promise<VoiceStreamResult> {
  const registry = params.registry ?? createVoiceProviderRegistry();
  const providerOrder = uniqueProviders(params.providerOrder);
  const errors: string[] = [];

  for (let index = 0; index < providerOrder.length; index += 1) {
    const provider = providerOrder[index];
    const adapter = registry.getAdapter(provider);

    try {
      const result = await adapter.streamSpeech({
        ...params.request,
        config: remapConfigForProvider(params.request.config, provider, registry),
      });
      if (index === 0) {
        return result;
      }
      const fallbackEvent = buildFallbackEvent({
        fromProvider: providerOrder[0],
        toProvider: provider,
        reason: errors.join(" | "),
        config: params.request.config,
      });
      params.onFallback?.(fallbackEvent);
      return {
        ...result,
        didFallback: true,
        fallbackEvent,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (index < providerOrder.length - 1) {
        const fallbackEvent = buildFallbackEvent({
          fromProvider: provider,
          toProvider: providerOrder[index + 1],
          reason: errors[errors.length - 1],
          config: params.request.config,
        });
        recordVoiceFallbackEvent(fallbackEvent);
        params.onFallback?.(fallbackEvent);
      }
    }
  }

  throw new Error(`All voice stream providers failed: ${errors.join(" | ")}`);
}

export function buildProviderPreferenceOrder(params: {
  preferredProvider?: VoiceRenderProvider;
  fallbackProviders?: VoiceRenderProvider[];
}): VoiceRenderProvider[] {
  return uniqueProviders([
    ...(params.preferredProvider ? [params.preferredProvider] : []),
    ...(params.fallbackProviders || []),
    ...listConfiguredVoiceProviders(),
  ]);
}

export function buildVoiceFallbackConnection(connection?: VoicePreparedConnection | null) {
  return connection ?? undefined;
}
