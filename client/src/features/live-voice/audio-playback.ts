import type { CustomerVoiceCast, VoiceRenderProvider } from "@/features/simulator/types";
import {
  chooseBrowserSpeechVoice,
  playRenderedCustomerAudio,
  speakWithBrowserVoiceCast,
} from "@/features/live-voice/voice-renderer";

export interface RenderedSpeechPayload {
  provider: VoiceRenderProvider;
  voiceId: string;
  contentType: string;
  audioBase64: string;
  didFallback?: boolean;
  fallbackEvent?: {
    fromProvider: VoiceRenderProvider;
    toProvider: VoiceRenderProvider;
    reason: string;
    attemptedVoiceId?: string;
  } | null;
  diagnostics?: unknown;
}

export interface AudioPlaybackLog {
  type: "audio_provider_selected" | "audio_provider_fallback";
  payload: Record<string, unknown>;
}

export interface AudioPlaybackResult {
  providerSelected: VoiceRenderProvider;
  providerUsed: VoiceRenderProvider;
  voiceId: string;
  playbackRoute: "external-rendered" | "native-fallback" | "browser-native";
  fallbackTriggered: boolean;
  fallbackReason?: string;
  fallbackEvent?: RenderedSpeechPayload["fallbackEvent"];
  diagnostics?: unknown;
  logs: AudioPlaybackLog[];
}

export interface PlayCustomerAudioTurnParams {
  message: string;
  voiceCast: CustomerVoiceCast;
  allowBrowserNativeFallback?: boolean;
  externalRenderRetryCount?: number;
  renderExternalSpeech: (params: {
    text: string;
    voiceCast: CustomerVoiceCast;
  }) => Promise<RenderedSpeechPayload>;
  playRenderedAudio?: typeof playRenderedCustomerAudio;
  speakNativeVoice?: typeof speakWithBrowserVoiceCast;
  chooseNativeVoice?: typeof chooseBrowserSpeechVoice;
  onAudioCreated?: (audio: HTMLAudioElement | null) => void;
}

export async function playCustomerAudioTurn(params: PlayCustomerAudioTurnParams): Promise<AudioPlaybackResult> {
  const playRenderedAudio = params.playRenderedAudio ?? playRenderedCustomerAudio;
  const speakNativeVoice = params.speakNativeVoice ?? speakWithBrowserVoiceCast;
  const chooseNativeVoice = params.chooseNativeVoice ?? chooseBrowserSpeechVoice;
  const allowBrowserNativeFallback = params.allowBrowserNativeFallback ?? true;
  const externalRenderRetryCount = Math.max(1, params.externalRenderRetryCount ?? 2);
  const selectedProvider = params.voiceCast.provider;
  const logs: AudioPlaybackLog[] = [
    {
      type: "audio_provider_selected",
      payload: {
        provider: selectedProvider,
        voiceId: params.voiceCast.voiceId,
        fallbackProviders: params.voiceCast.fallbackProviders,
      },
    },
  ];

  const speakWithNativeFallback = async (reason: string): Promise<AudioPlaybackResult> => {
    if (!allowBrowserNativeFallback) {
      throw new Error(reason);
    }
    const browserVoice = chooseNativeVoice(params.voiceCast);
    await speakNativeVoice({
      message: params.message,
      cast: params.voiceCast,
      preferredVoice: browserVoice,
    });
    if (selectedProvider !== "browser-native-speech") {
      logs.push({
        type: "audio_provider_fallback",
        payload: {
          fromProvider: selectedProvider,
          toProvider: "browser-native-speech",
          reason,
        },
      });
    }
    return {
      providerSelected: selectedProvider,
      providerUsed: "browser-native-speech",
      voiceId: browserVoice?.voiceURI || params.voiceCast.voiceId,
      playbackRoute: selectedProvider === "browser-native-speech" ? "browser-native" : "native-fallback",
      fallbackTriggered: selectedProvider !== "browser-native-speech",
      fallbackReason: reason,
      logs,
    };
  };

  if (selectedProvider === "browser-native-speech") {
    if (!allowBrowserNativeFallback) {
      throw new Error("browser_native_fallback_disabled");
    }
    return await speakWithNativeFallback("browser_native_selected");
  }

  let lastExternalFailure = "external_renderer_failed";

  for (let attempt = 1; attempt <= externalRenderRetryCount; attempt += 1) {
    try {
      const rendered = await params.renderExternalSpeech({
        text: params.message,
        voiceCast: params.voiceCast,
      });
      const playback = await playRenderedAudio({
        audioBase64: rendered.audioBase64,
        contentType: rendered.contentType,
        onAudioCreated: params.onAudioCreated,
      });
      const providerUsed = rendered.provider || selectedProvider;

      if (rendered.didFallback || providerUsed !== selectedProvider) {
        logs.push({
          type: "audio_provider_fallback",
          payload: {
            fromProvider: selectedProvider,
            toProvider: providerUsed,
            reason: rendered.fallbackEvent?.reason || "provider_switched_during_render",
            fallbackEvent: rendered.fallbackEvent || null,
          },
        });
      }

      if (playback.completed) {
        return {
          providerSelected: selectedProvider,
          providerUsed,
          voiceId: rendered.voiceId,
          playbackRoute: "external-rendered",
          fallbackTriggered: Boolean(rendered.didFallback || providerUsed !== selectedProvider),
          fallbackReason: rendered.fallbackEvent?.reason,
          fallbackEvent: rendered.fallbackEvent,
          diagnostics: rendered.diagnostics,
          logs,
        };
      }

      lastExternalFailure = playback.error || "external_audio_playback_failed";
    } catch (error) {
      lastExternalFailure = error instanceof Error ? error.message : "external_renderer_failed";
    }

    if (attempt < externalRenderRetryCount) {
      logs.push({
        type: "audio_provider_fallback",
        payload: {
          fromProvider: selectedProvider,
          toProvider: selectedProvider,
          reason: `retry_attempt_${attempt}:${lastExternalFailure}`,
        },
      });
    }
  }

  return await speakWithNativeFallback(lastExternalFailure);
}
