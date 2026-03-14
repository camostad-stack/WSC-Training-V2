import { ENV } from "../_core/env";
import type { ScenarioDirectorResult } from "./ai/contracts";
import {
  buildLiveCustomerSessionInstructions,
  buildOpeningResponseInstructions,
} from "./customer-runtime";
import {
  createCustomerVoiceCast,
  listConfiguredVoiceProviders,
  parseVoiceProviderList,
  type CustomerVoiceCast,
  type VoiceRenderProvider,
} from "./voice-rendering";

export interface LiveVoiceCredentialRequest {
  scenario: ScenarioDirectorResult;
  employeeRole: string;
  sessionSeed?: string;
}

export interface LiveVoiceSessionCredentials {
  enabled: boolean;
  provider: VoiceRenderProvider;
  transport: "openai-realtime-webrtc" | "browser-native-speech";
  audioOutputMode: "realtime-native" | "external-rendered";
  responseModalities: Array<"audio" | "text">;
  mode: "live_voice";
  model: string;
  voice: string;
  connectionUrl: string;
  clientSecret?: string;
  expiresAt?: number | null;
  sessionId?: string | null;
  sessionSeed: string;
  turnControl: "backend_validated_manual";
  allowLocalBrowserFallback: boolean;
  allowBrowserNativeAudioFallback: boolean;
  voiceCast: CustomerVoiceCast;
  qaCompareProviders: VoiceRenderProvider[];
  openingResponseInstructions: string;
  instructions?: string;
  reason?: string;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildRealtimeBaseUrl() {
  return ensureTrailingSlash(ENV.forgeApiUrl);
}

function uniqueProviders(providers: VoiceRenderProvider[]) {
  return Array.from(new Set(providers));
}

function resolveLiveRenderProviderOrder() {
  const configuredProviders = listConfiguredVoiceProviders();
  const configuredSet = new Set(configuredProviders);
  const preferredFromEnv = parseVoiceProviderList(ENV.voiceRenderPrimaryProvider)[0];
  const fallbackFromEnv = parseVoiceProviderList(ENV.voiceRenderFallbackProviders);
  const preferredProvider = ENV.voiceRenderMode === "realtime-native"
    ? "openai-realtime-native"
    : preferredFromEnv;
  const ordered = uniqueProviders([
    ...(preferredProvider ? [preferredProvider] : []),
    ...fallbackFromEnv,
    ...configuredProviders,
  ]).filter((provider) => configuredSet.has(provider));

  if (ENV.voiceRenderMode === "external-provider") {
    const externalOnly = ordered.filter((provider) => (
      provider !== "openai-realtime-native"
      && (ENV.voiceRenderAllowBrowserNativeFallback || provider !== "browser-native-speech")
    ));
    return externalOnly;
  }

  const filtered = ordered.filter((provider) => (
    ENV.voiceRenderAllowBrowserNativeFallback
    || provider !== "browser-native-speech"
  ));
  return filtered;
}

function buildQaCompareProviders(primaryProvider: VoiceRenderProvider, configuredProviders: VoiceRenderProvider[]) {
  const baselineProvider = parseVoiceProviderList(ENV.voiceRenderQaBaselineProvider)[0] || "openai-native-speech";
  const configuredSet = new Set(configuredProviders);
  return uniqueProviders([
    primaryProvider,
    baselineProvider,
    "openai-native-speech",
  ]).filter((provider) => configuredSet.has(provider) && provider !== "browser-native-speech");
}

function resolveAudioOutputMode(provider: VoiceRenderProvider): "realtime-native" | "external-rendered" {
  return provider === "openai-realtime-native" && ENV.voiceRenderMode === "realtime-native"
    ? "realtime-native"
    : "external-rendered";
}

export function buildLiveVoiceInstructions(scenario: ScenarioDirectorResult, employeeRole: string) {
  const [preferredProvider] = resolveLiveRenderProviderOrder();
  const voiceCast = createCustomerVoiceCast({
    scenario,
    sessionSeed: `${scenario.scenario_id}:preview`,
    preferredProvider,
    allowedProviders: resolveLiveRenderProviderOrder(),
  });
  return buildLiveCustomerSessionInstructions({
    scenario,
    employeeRole,
    voiceCast,
  });
}

function buildConnectionUrl(model: string) {
  if (!ENV.forgeApiUrl) {
    return `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
  }
  const url = new URL("v1/realtime", buildRealtimeBaseUrl());
  url.searchParams.set("model", model);
  return url.toString();
}

export async function createLiveVoiceSessionCredentials(
  input: LiveVoiceCredentialRequest,
): Promise<LiveVoiceSessionCredentials> {
  const model = ENV.realtimeModel;
  const sessionSeed = input.sessionSeed || `${input.scenario.scenario_id}-live`;
  const providerOrder = resolveLiveRenderProviderOrder();
  const preferredProvider = providerOrder[0] || "browser-native-speech";
  const voiceCast = createCustomerVoiceCast({
    scenario: input.scenario,
    sessionSeed,
    preferredProvider,
    allowedProviders: providerOrder,
  });
  const audioOutputMode = resolveAudioOutputMode(voiceCast.provider);
  const responseModalities = audioOutputMode === "realtime-native"
    ? ["audio", "text"] as Array<"audio" | "text">
    : ["text"] as Array<"audio" | "text">;
  const configuredProviders = listConfiguredVoiceProviders();
  const qaCompareProviders = buildQaCompareProviders(voiceCast.provider, configuredProviders);
  const voice = audioOutputMode === "realtime-native" ? voiceCast.voiceId : ENV.realtimeVoice;
  const instructions = buildLiveCustomerSessionInstructions({
    scenario: input.scenario,
    employeeRole: input.employeeRole,
    voiceCast,
  });
  const openingResponseInstructions = buildOpeningResponseInstructions({
    scenario: input.scenario,
    voiceCast,
  });

  if (providerOrder.length === 0) {
    return {
      enabled: false,
      provider: voiceCast.provider,
      transport: "openai-realtime-webrtc",
      audioOutputMode,
      responseModalities,
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      sessionSeed,
      turnControl: "backend_validated_manual",
      allowLocalBrowserFallback: ENV.liveVoiceAllowLocalBrowserFallback,
      allowBrowserNativeAudioFallback: ENV.voiceRenderAllowBrowserNativeFallback,
      voiceCast,
      qaCompareProviders,
      openingResponseInstructions,
      instructions,
      reason: "No provider-backed live voice renderer is configured. Browser fallback is disabled for this environment.",
    };
  }

  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    return {
      enabled: false,
      provider: voiceCast.provider,
      transport: "browser-native-speech",
      audioOutputMode,
      responseModalities,
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      sessionSeed,
      turnControl: "backend_validated_manual",
      allowLocalBrowserFallback: ENV.liveVoiceAllowLocalBrowserFallback,
      allowBrowserNativeAudioFallback: ENV.voiceRenderAllowBrowserNativeFallback,
      voiceCast,
      qaCompareProviders,
      openingResponseInstructions,
      instructions,
      reason: "Realtime session credentials are not configured on the server.",
    };
  }

  const payload = {
    session: {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            create_response: false,
            interrupt_response: true,
          },
          transcription: {
            model: "gpt-4o-mini-transcribe",
          },
        },
        output: {
          voice,
        },
      },
    },
    expires_after: {
      anchor: "created_at",
      seconds: 120,
    },
  };

  try {
    const response = await fetch(new URL("v1/realtime/client_secrets", buildRealtimeBaseUrl()), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      return {
      enabled: false,
      provider: voiceCast.provider,
      transport: "openai-realtime-webrtc",
      audioOutputMode,
      responseModalities,
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      sessionSeed,
      turnControl: "backend_validated_manual",
      allowLocalBrowserFallback: ENV.liveVoiceAllowLocalBrowserFallback,
      allowBrowserNativeAudioFallback: ENV.voiceRenderAllowBrowserNativeFallback,
      voiceCast,
      qaCompareProviders,
      openingResponseInstructions,
      instructions,
      reason: `Realtime credential request failed (${response.status} ${response.statusText}): ${message}`,
    };
    }

    const json = await response.json() as {
      id?: string;
      expires_at?: number;
      value?: string;
      client_secret?: { value?: string; expires_at?: number | null };
    };

    const clientSecret = json.client_secret?.value ?? json.value;
    const expiresAt = json.client_secret?.expires_at ?? json.expires_at ?? null;

    if (!clientSecret) {
      return {
        enabled: false,
        provider: voiceCast.provider,
        transport: "openai-realtime-webrtc",
        audioOutputMode,
        responseModalities,
        mode: "live_voice",
        model,
        voice,
        connectionUrl: buildConnectionUrl(model),
        sessionSeed,
        turnControl: "backend_validated_manual",
        allowLocalBrowserFallback: ENV.liveVoiceAllowLocalBrowserFallback,
        allowBrowserNativeAudioFallback: ENV.voiceRenderAllowBrowserNativeFallback,
        voiceCast,
        qaCompareProviders,
        openingResponseInstructions,
        instructions,
        reason: "Realtime credential response did not include a client secret.",
      };
    }

    return {
      enabled: true,
      provider: voiceCast.provider,
      transport: "openai-realtime-webrtc",
      audioOutputMode,
      responseModalities,
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      clientSecret,
      expiresAt,
      sessionId: json.id ?? null,
      sessionSeed,
      turnControl: "backend_validated_manual",
      allowLocalBrowserFallback: ENV.liveVoiceAllowLocalBrowserFallback,
      allowBrowserNativeAudioFallback: ENV.voiceRenderAllowBrowserNativeFallback,
      voiceCast,
      qaCompareProviders,
      openingResponseInstructions,
      instructions,
    };
  } catch (error) {
    return {
      enabled: false,
      provider: voiceCast.provider,
      transport: "openai-realtime-webrtc",
      audioOutputMode,
      responseModalities,
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      sessionSeed,
      turnControl: "backend_validated_manual",
      allowLocalBrowserFallback: ENV.liveVoiceAllowLocalBrowserFallback,
      allowBrowserNativeAudioFallback: ENV.voiceRenderAllowBrowserNativeFallback,
      voiceCast,
      qaCompareProviders,
      openingResponseInstructions,
      instructions,
      reason: error instanceof Error ? error.message : "Realtime credential request failed.",
    };
  }
}
