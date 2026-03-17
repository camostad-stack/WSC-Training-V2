import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type {
  ScenarioCard,
  SimulatorConfig,
  TimingMarker,
  LiveTurnEvent,
  ConversationTurn,
  SimulationStateSnapshot,
  VoiceDeliveryAnalysis,
  CustomerVoiceCast,
} from "@/features/simulator/types";
import type { LiveVoiceAssistantPhase, LiveVoiceMode } from "@/features/live-voice/ux";
import {
  chooseBrowserSpeechVoice,
  speakWithBrowserVoiceCast,
  stopRenderedCustomerAudio,
} from "@/features/live-voice/voice-renderer";
import { playCustomerAudioTurn } from "@/features/live-voice/audio-playback";
import {
  getRealtimeEmployeeTurnFinalizeDelay,
  resolveRealtimeResponseCompletion,
} from "@/features/live-voice/realtime-control";
import {
  buildRealtimeResponseCreateEvent,
  claimRealtimeResponseCompletion,
  extractRealtimeErrorMessage,
  isRealtimeResponseCompletionEvent,
} from "@/features/live-voice/realtime-protocol";
import {
  applyRealtimeTurnSequencerEvent,
  consumeRealtimeTurnSequencerState,
  createRealtimeTurnSequencerState,
} from "@/features/live-voice/realtime-turn-sequencer";
import {
  appendBlockedPrematureClosureToState,
  deriveConversationRuntimeView,
  deriveManualExitDisposition,
  looksLikeClosingLanguage,
} from "@/features/simulator/runtime";
import {
  appendConversationRuntimeEvent,
  buildExplicitFailureOutcomePatch,
  buildRuntimeEvent,
  evaluateConversationTerminalState,
  isTerminalConversationState,
} from "@shared/conversation-outcome";

export type LiveConnectionState =
  | "idle"
  | "requesting_permissions"
  | "requesting_credentials"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "fallback"
  | "ended"
  | "error";

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function nowMs(startedAt: number | null) {
  return Math.max(0, Date.now() - (startedAt ?? Date.now()));
}

const LOCAL_VOICE_ANALYZER_URL = "http://localhost:3010";
const LIVE_SESSION_INACTIVITY_TIMEOUT_MS = 45_000;
const REALTIME_EMPLOYEE_TURN_GRACE_MS = 1_200;

type TurnCaptureStatus = "idle" | "recording" | "uploading" | "error";

function chooseRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

function extractTextFromUnknown(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const combined = value.map(extractTextFromUnknown).filter(Boolean).join(" ").trim();
    return combined || null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return extractTextFromUnknown(
      record.transcript
        ?? record.text
        ?? record.content
        ?? record.audio_transcript
        ?? record.delta,
    );
  }
  return null;
}

function extractAssistantTranscript(event: Record<string, unknown>): string | null {
  return extractTextFromUnknown(
    event.transcript
      ?? event.delta
      ?? event.text
      ?? event.output_text
      ?? event.part
      ?? event.content_part
      ?? event.item
      ?? event.response,
  );
}

export function useLiveVoiceSession(params: {
  scenario: ScenarioCard;
  config: SimulatorConfig;
}) {
  const createCredentials = trpc.liveVoice.createCredentials.useMutation();
  const processLiveTurn = trpc.liveVoice.processTurn.useMutation();
  const renderSpeech = trpc.liveVoice.renderSpeech.useMutation();
  const authMe = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const selfVideoStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const renderedCustomerAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<Blob[]>([]);
  const turnBlobResolverRef = useRef<((blob: Blob | null) => void) | null>(null);
  const discardTurnCaptureRef = useRef(false);
  const browserSpeechVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const sessionBlueprintRef = useRef<Awaited<ReturnType<typeof createCredentials.mutateAsync>> | null>(null);
  const processedRealtimeResponseIdsRef = useRef<Set<string>>(new Set());
  const realtimeTurnSequencerRef = useRef(createRealtimeTurnSequencerState());
  const realtimeTurnFinalizeTimerRef = useRef<number | null>(null);
  const employeeSpeechRevisionRef = useRef(0);
  const pendingRealtimeResponseRevisionRef = useRef<number | null>(null);
  const pendingRealtimeTerminalValidationRef = useRef<{
    isTerminal: boolean;
    terminalReason: string;
    blockedBy: string[];
  } | null>(null);
  const processingRealtimeTurnRef = useRef(false);
  const shouldResumeRecognitionRef = useRef(false);
  const localVoiceEnabledRef = useRef(false);
  const liveSessionIdRef = useRef<string>(`live-${params.scenario.scenario_id}`);
  const latestTranscriptRef = useRef<ConversationTurn[]>([]);
  const latestStateHistoryRef = useRef<SimulationStateSnapshot[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const transcriptKeysRef = useRef<Set<string>>(new Set());
  const customerTranscriptBufferRef = useRef<Map<string, string>>(new Map());
  const customerTextBufferRef = useRef<Map<string, string>>(new Map());
  const [connectionState, setConnectionState] = useState<LiveConnectionState>("idle");
  const [voiceMode, setVoiceMode] = useState<LiveVoiceMode>("fallback");
  const [assistantPhase, setAssistantPhase] = useState<LiveVoiceAssistantPhase>("setup");
  const [lastError, setLastError] = useState<string | null>(null);
  const [draftTranscript, setDraftTranscript] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [selfVideoEnabled, setSelfVideoEnabled] = useState(false);
  const [selfVideoStream, setSelfVideoStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<ConversationTurn[]>([]);
  const [stateHistory, setStateHistory] = useState<SimulationStateSnapshot[]>([]);
  const [turnEvents, setTurnEvents] = useState<LiveTurnEvent[]>([]);
  const [timingMarkers, setTimingMarkers] = useState<TimingMarker[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [turnCaptureStatus, setTurnCaptureStatus] = useState<TurnCaptureStatus>("idle");
  const [lastDeliveryAnalysis, setLastDeliveryAnalysis] = useState<VoiceDeliveryAnalysis | null>(null);
  const [deliveryAnalysisError, setDeliveryAnalysisError] = useState<string | null>(null);
  const latestState = stateHistory[stateHistory.length - 1] || null;
  const runtimeView = useMemo(() => deriveConversationRuntimeView(latestState), [latestState]);

  const appendTimingMarker = useCallback((name: string, detail?: string) => {
    setTimingMarkers(prev => [...prev, { name, atMs: nowMs(startedAtRef.current), detail }]);
  }, []);

  const appendTurnEvent = useCallback((event: LiveTurnEvent) => {
    setTurnEvents(prev => [...prev, event]);
  }, []);

  const appendAudioPlaybackLogs = useCallback((logs: Array<{ type: string; payload: Record<string, unknown> }>) => {
    logs.forEach((entry) => {
      appendTurnEvent({
        type: entry.type,
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: entry.payload,
      });
    });
  }, [appendTurnEvent]);

  const appendCloseTriggerLog = useCallback((params: {
    trigger: string;
    accepted: boolean;
    reason: string;
    source: "system" | "employee" | "customer";
    blockedBy?: string[];
  }) => {
    appendTurnEvent({
      type: params.accepted ? "close_trigger_accepted" : "close_trigger_rejected",
      source: params.source,
      atMs: nowMs(startedAtRef.current),
      payload: {
        trigger: params.trigger,
        reason: params.reason,
        blockedBy: params.blockedBy || [],
      },
    });
  }, [appendTurnEvent]);

  const appendTranscript = useCallback((role: "customer" | "employee", message: string, key: string, emotion?: string) => {
    const normalized = message.trim();
    if (!normalized || transcriptKeysRef.current.has(key)) return;
    transcriptKeysRef.current.add(key);
    setTranscript(prev => [...prev, { role, message: normalized, emotion, timestamp: Date.now() }]);
  }, []);

  const appendStateSnapshot = useCallback((snapshot: SimulationStateSnapshot) => {
    setStateHistory((prev) => [...prev, snapshot]);
  }, []);

  const clearRealtimeTurnFinalizeTimer = useCallback(() => {
    if (realtimeTurnFinalizeTimerRef.current !== null) {
      window.clearTimeout(realtimeTurnFinalizeTimerRef.current);
      realtimeTurnFinalizeTimerRef.current = null;
    }
  }, []);

  const replaceLatestStateSnapshot = useCallback((update: (latest: SimulationStateSnapshot) => SimulationStateSnapshot | null) => {
    setStateHistory((prev) => {
      if (prev.length === 0) return prev;
      const latest = prev[prev.length - 1];
      const patched = update(latest);
      if (!patched) return prev;
      const next = [...prev.slice(0, -1), patched];
      latestStateHistoryRef.current = next;
      return next;
    });
  }, []);

  const appendFailureStateSnapshot = useCallback((failureParams: {
    eventType: "abandonment_detected" | "timeout_failure";
    source: "client" | "live_runtime";
    summary: string;
  }) => {
    const latestState = latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1];
    const basePatch = buildExplicitFailureOutcomePatch(
      failureParams.summary,
      latestState?.unmet_completion_criteria || params.scenario.completion_criteria || [],
      failureParams.eventType,
    );
    const patchedState = {
      ...(latestState || {
        turn_number: 1,
        emotion_state: params.scenario.customer_persona?.initial_emotion || "concerned",
      }),
      ...basePatch,
      turn_number: (latestState?.turn_number || 0) + 1,
      emotion_state: latestState?.emotion_state || params.scenario.customer_persona?.initial_emotion || "concerned",
      emotional_state: latestState?.emotional_state || latestState?.emotion_state || params.scenario.customer_persona?.initial_emotion || "concerned",
      analysis_summary: latestState?.analysis_summary || failureParams.summary,
      likely_next_behavior: "disengage",
    } as SimulationStateSnapshot;
    patchedState.runtime_events = appendConversationRuntimeEvent(
      patchedState,
      buildRuntimeEvent(failureParams.eventType, patchedState, failureParams.source, failureParams.summary, {
        atTurn: patchedState.turn_number,
      }),
    );
    appendStateSnapshot(patchedState);
    return patchedState;
  }, [appendStateSnapshot, params.scenario]);

  const recordBlockedPrematureClosure = useCallback((params: {
    triggerSource: "employee_transcript" | "employee_wrap_up_language" | "customer_reply_pattern" | "runtime_end_trigger" | "ui_auto_finish" | "transcript_finalized";
    triggerPhraseOrReason: string;
    source: "client" | "live_runtime";
    summary: string;
  }) => {
    replaceLatestStateSnapshot((latest) => appendBlockedPrematureClosureToState(latest, {
      source: params.source,
      triggerSource: params.triggerSource,
      triggerPhraseOrReason: params.triggerPhraseOrReason,
      summary: params.summary,
    }));
  }, [replaceLatestStateSnapshot]);

  const startEmployeeTurnCapture = useCallback(() => {
    if (typeof MediaRecorder === "undefined" || !audioStreamRef.current || turnRecorderRef.current) {
      return;
    }

    const mimeType = chooseRecordingMimeType();

    try {
      const recorder = mimeType
        ? new MediaRecorder(audioStreamRef.current, { mimeType })
        : new MediaRecorder(audioStreamRef.current);

      discardTurnCaptureRef.current = false;
      turnChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          turnChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const resolver = turnBlobResolverRef.current;
        turnBlobResolverRef.current = null;
        turnRecorderRef.current = null;
        const discard = discardTurnCaptureRef.current;
        discardTurnCaptureRef.current = false;
        const blob = !discard && turnChunksRef.current.length > 0
          ? new Blob(turnChunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
          : null;
        turnChunksRef.current = [];
        setTurnCaptureStatus("idle");
        resolver?.(blob);
      };
      recorder.start();
      turnRecorderRef.current = recorder;
      setTurnCaptureStatus("recording");
    } catch {
      setTurnCaptureStatus("error");
    }
  }, []);

  const stopEmployeeTurnCapture = useCallback(async (discard = false) => {
    const recorder = turnRecorderRef.current;
    if (!recorder) return null;
    if (recorder.state === "inactive") {
      turnRecorderRef.current = null;
      turnChunksRef.current = [];
      setTurnCaptureStatus("idle");
      return null;
    }
    discardTurnCaptureRef.current = discard;
    const blobPromise = new Promise<Blob | null>((resolve) => {
      turnBlobResolverRef.current = resolve;
    });
    recorder.stop();
    return await blobPromise;
  }, []);

  const analyzeEmployeeDelivery = useCallback(async (audioBlob: Blob | null, transcriptText: string) => {
    if (!audioBlob || audioBlob.size === 0) return null;

    setTurnCaptureStatus("uploading");
    setDeliveryAnalysisError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, audioBlob.type.includes("mp4") ? "turn.mp4" : "turn.webm");
      formData.append("sessionId", liveSessionIdRef.current);
      formData.append("employeeId", authMe.data?.user?.id ? String(authMe.data.user.id) : "unknown_employee");
      if (transcriptText.trim()) {
        formData.append("transcript", transcriptText.trim());
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${LOCAL_VOICE_ANALYZER_URL}/analyze-audio-turn`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      }).finally(() => {
        window.clearTimeout(timeoutId);
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.details || json?.error || "Voice delivery analysis failed");
      }

      const analysis = (json?.analysis || null) as VoiceDeliveryAnalysis | null;
      setLastDeliveryAnalysis(analysis);
      setTurnCaptureStatus("idle");

      appendTurnEvent({
        type: "employee_audio_analysis",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          analysis,
        },
      });
      appendTimingMarker("employee_audio_analysis_complete");
      return analysis;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice delivery analysis failed";
      setTurnCaptureStatus("error");
      setDeliveryAnalysisError(message);
      appendTurnEvent({
        type: "employee_audio_analysis_failed",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: { message },
      });
      appendTimingMarker("employee_audio_analysis_failed", message);
      return null;
    }
  }, [appendTimingMarker, appendTurnEvent, authMe.data?.user?.id]);

  useEffect(() => {
    latestTranscriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    latestStateHistoryRef.current = stateHistory;
  }, [stateHistory]);

  const getActiveVoiceCast = useCallback((): CustomerVoiceCast => {
    return sessionBlueprintRef.current?.voiceCast || {
      provider: "browser-native-speech",
      voiceId: "browser-direct-1",
      sessionSeed: liveSessionIdRef.current,
      cadenceFingerprint: "steady-with-light-hesitation",
      personaArchetype: "steady_practical",
      openerCadencePattern: "straight-to-the-point",
      apologyRhythmPattern: "matter-of-fact",
      closurePhrasingStyle: "practical-sign-off",
      emotionalArcPattern: "flat-then-wary-trust",
      pace: "steady",
      warmth: "neutral",
      sharpness: "balanced",
      energy: "medium",
      interruptionTendency: "situational",
      hesitationTendency: "light",
      verbosityTendency: "balanced",
      ageFlavor: "adult",
      emotionalResponsiveness: "flexible",
      speechRate: 0.98,
      pitch: 0.98,
      stylePrompt: "Speak in a steady, ordinary rhythm with balanced spoken turns.",
      emotionHint: "grounded and emotionally present",
      providerModel: "browser-speech-synthesis",
      fallbackProviders: [],
      repeatCallerKey: undefined,
      preserveCallerVoice: false,
      providerCapabilities: {
        provider: "browser-native-speech",
        supportsStreaming: false,
        supportsEmotionControl: false,
        supportsSpeedControl: true,
        supportsStyleControl: false,
        supportsCustomVoices: false,
        supportsRealtimeNativeOutput: true,
        supportsWordTimestamps: false,
        defaultModel: "browser-speech-synthesis",
        supportedModels: ["browser-speech-synthesis"],
        outputFormats: [{ container: "mp3", encoding: "mp3", mimeType: "audio/mpeg" }],
      },
      castingDiagnostics: {
        repeatCaller: false,
        recentVoiceUsageFrequency: 0,
        recentProviderUsageFrequency: 0,
        recentPersonaUsageFrequency: 0,
        recentCadenceUsageFrequency: 0,
        assignmentReasons: ["local-fallback-default"],
        fallbackEvents: [],
      },
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return undefined;
    const assignVoice = () => {
      browserSpeechVoiceRef.current = chooseBrowserSpeechVoice(getActiveVoiceCast());
    };
    assignVoice();
    window.speechSynthesis.onvoiceschanged = assignVoice;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [getActiveVoiceCast]);

  const stopStreams = useCallback(() => {
    if (turnRecorderRef.current) {
      discardTurnCaptureRef.current = true;
      if (turnRecorderRef.current.state !== "inactive") {
        turnRecorderRef.current.stop();
      }
      turnRecorderRef.current = null;
    }
    audioStreamRef.current?.getTracks().forEach(track => track.stop());
    audioStreamRef.current = null;
    selfVideoStreamRef.current?.getTracks().forEach(track => track.stop());
    selfVideoStreamRef.current = null;
    turnChunksRef.current = [];
    turnBlobResolverRef.current?.(null);
    turnBlobResolverRef.current = null;
    setTurnCaptureStatus("idle");
    setSelfVideoStream(null);
  }, []);

  const cleanupConnection = useCallback(() => {
    clearRealtimeTurnFinalizeTimer();
    shouldResumeRecognitionRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    localVoiceEnabledRef.current = false;
    processingRealtimeTurnRef.current = false;
    pendingRealtimeTerminalValidationRef.current = null;
    setDraftTranscript("");
    window.speechSynthesis?.cancel?.();
    stopRenderedCustomerAudio(renderedCustomerAudioRef.current);
    renderedCustomerAudioRef.current = null;
    customerTextBufferRef.current.clear();
    customerTranscriptBufferRef.current.clear();
    processedRealtimeResponseIdsRef.current.clear();
    realtimeTurnSequencerRef.current = createRealtimeTurnSequencerState();
    pendingRealtimeResponseRevisionRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    startedAtRef.current = null;
    setAssistantPhase("ended");
    stopStreams();
  }, [clearRealtimeTurnFinalizeTimer, stopStreams]);

  const failLiveVoiceSession = useCallback((reason: string, detail?: string) => {
    cleanupConnection();
    setVoiceMode("fallback");
    setConnectionState("error");
    setAssistantPhase("error");
    setLastError(reason);
    appendTurnEvent({
      type: "live_voice_runtime_error",
      source: "system",
      atMs: nowMs(startedAtRef.current),
      payload: {
        reason,
        detail: detail || null,
      },
    });
    appendTimingMarker("live_voice_runtime_error", detail || reason);
  }, [appendTimingMarker, appendTurnEvent, cleanupConnection]);

  const speakCustomerMessage = useCallback(async (message: string) => {
    setAssistantPhase("customer_speaking");
    const voiceCast = getActiveVoiceCast();
    stopRenderedCustomerAudio(renderedCustomerAudioRef.current);
    renderedCustomerAudioRef.current = null;
    window.speechSynthesis?.cancel?.();
    try {
      const playback = await playCustomerAudioTurn({
        message,
        voiceCast,
        allowBrowserNativeFallback: sessionBlueprintRef.current?.allowBrowserNativeAudioFallback ?? false,
        externalRenderRetryCount: 2,
        renderExternalSpeech: ({ text, voiceCast: cast }) => renderSpeech.mutateAsync({
          text,
          voiceCast: cast,
          providerOrder: [cast.provider],
        }),
        chooseNativeVoice: (cast) => {
          if (!browserSpeechVoiceRef.current) {
            browserSpeechVoiceRef.current = chooseBrowserSpeechVoice(cast);
          }
          return browserSpeechVoiceRef.current;
        },
        speakNativeVoice: async ({ message, cast, preferredVoice }) => {
          await speakWithBrowserVoiceCast({
            message,
            cast,
            preferredVoice,
          });
        },
        onAudioCreated: (audio) => {
          renderedCustomerAudioRef.current = audio;
        },
      });

      appendAudioPlaybackLogs(playback.logs);
      appendTurnEvent({
        type: "customer_voice_playback_completed",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          providerSelected: playback.providerSelected,
          providerUsed: playback.providerUsed,
          voiceId: playback.voiceId,
          playbackRoute: playback.playbackRoute,
          fallbackTriggered: playback.fallbackTriggered,
          fallbackReason: playback.fallbackReason || null,
          fallbackEvent: playback.fallbackEvent || null,
          diagnostics: playback.diagnostics || null,
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "customer_voice_render_failed";
      appendTurnEvent({
        type: "audio_provider_error",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          provider: voiceCast.provider,
          voiceId: voiceCast.voiceId,
          reason: message,
        },
      });
      appendTimingMarker("customer_audio_degraded", message);
      setLastError(`Customer audio dropped for one turn. Check the transcript and continue. ${message}`);
      setAssistantPhase("listening");
      return true;
    }
  }, [appendAudioPlaybackLogs, appendTimingMarker, appendTurnEvent, getActiveVoiceCast, renderSpeech]);

  const stopRecognition = useCallback(() => {
    shouldResumeRecognitionRef.current = false;
    recognitionRef.current?.stop();
    void stopEmployeeTurnCapture(true);
    if (localVoiceEnabledRef.current) {
      setAssistantPhase("paused");
    }
  }, [stopEmployeeTurnCapture]);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current || isMuted || connectionState === "ended" || connectionState === "error") return;
    shouldResumeRecognitionRef.current = true;
    if (localVoiceEnabledRef.current) {
      setAssistantPhase("listening");
      startEmployeeTurnCapture();
    }
    try {
      recognitionRef.current.start();
    } catch {
      // Browser speech recognition throws if start() is called twice.
    }
  }, [connectionState, isMuted, startEmployeeTurnCapture]);

  const sendClientEvent = useCallback((event: Record<string, unknown>) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== "open") return;
    dataChannelRef.current.send(JSON.stringify(event));
    appendTurnEvent({
      type: String(event.type ?? "client_event"),
      source: "system",
      atMs: nowMs(startedAtRef.current),
      payload: event,
    });
  }, [appendTurnEvent]);

  const processEmployeeTurnThroughRuntime = useCallback(async (
    employeeMessage: string,
    deliveryAnalysis?: VoiceDeliveryAnalysis | null,
    responseMode: "browser" | "realtime" = "browser",
    transcriptAlreadyAppended = false,
  ) => {
    const normalized = employeeMessage.trim();
    if (!normalized) return;

    setDraftTranscript("");
    setAssistantPhase("processing");
    appendTimingMarker("employee_turn_submitted");
    appendTurnEvent({
      type: "employee_transcript",
      source: "employee",
      atMs: nowMs(startedAtRef.current),
      payload: { text: normalized },
    });
    if (deliveryAnalysis) {
      appendTurnEvent({
        type: "employee_audio_analysis_used",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          rushedRisk: deliveryAnalysis.delivery?.rushedRisk,
          hesitationRisk: deliveryAnalysis.pacing?.hesitationRisk,
          fragmentationRisk: deliveryAnalysis.delivery?.fragmentationRisk,
          sharpnessRisk: deliveryAnalysis.delivery?.sharpnessRisk,
          coachingSignals: deliveryAnalysis.coachingSignals || [],
        },
      });
    }
    if (!transcriptAlreadyAppended) {
      appendTranscript("employee", normalized, `employee-${Date.now()}`);
    }

    const employeeTurn: ConversationTurn = {
      role: "employee",
      message: normalized,
      timestamp: Date.now(),
    };

    const priorState = latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1];
    const latestTranscriptTurn = latestTranscriptRef.current[latestTranscriptRef.current.length - 1];
    const transcriptTurns = transcriptAlreadyAppended
      && latestTranscriptTurn?.role === "employee"
      && latestTranscriptTurn.message.trim() === normalized
      ? latestTranscriptRef.current
      : [...latestTranscriptRef.current, employeeTurn];
    const transcriptPayload = transcriptTurns.map((turn) => ({
      role: turn.role,
      message: turn.message,
      emotion: turn.emotion,
    }));

    const result = await processLiveTurn.mutateAsync({
      scenarioJson: params.scenario,
      deliveryAnalysis: deliveryAnalysis || undefined,
      transcript: transcriptPayload,
      employeeResponse: normalized,
      stateJson: priorState || undefined,
      sessionSeed: liveSessionIdRef.current,
      preferredVoiceProvider: getActiveVoiceCast().provider,
      voiceCast: getActiveVoiceCast(),
    });

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    const reply = parsed?.customerReply || parsed?.customer_reply || {};
    const nextState = parsed?.stateUpdate || parsed?.state_update || null;
    const customerReply = reply.customer_reply || parsed.customer_reply || "...";
    const emotion = reply.updated_emotion || parsed.updated_emotion || nextState?.emotion_state || params.scenario.customer_persona?.initial_emotion;
    const terminalOutcome = parsed?.terminalValidation || evaluateConversationTerminalState(nextState);
    if (parsed?.voiceCast && sessionBlueprintRef.current) {
      const lockedVoiceCast = sessionBlueprintRef.current.voiceCast;
      if (!lockedVoiceCast) {
        sessionBlueprintRef.current = {
          ...sessionBlueprintRef.current,
          voiceCast: parsed.voiceCast,
        };
        browserSpeechVoiceRef.current = chooseBrowserSpeechVoice(parsed.voiceCast);
      } else if (
        lockedVoiceCast.provider !== parsed.voiceCast.provider
        || lockedVoiceCast.voiceId !== parsed.voiceCast.voiceId
      ) {
        appendTurnEvent({
          type: "audio_provider_change_ignored",
          source: "system",
          atMs: nowMs(startedAtRef.current),
          payload: {
            lockedProvider: lockedVoiceCast.provider,
            lockedVoiceId: lockedVoiceCast.voiceId,
            attemptedProvider: parsed.voiceCast.provider,
            attemptedVoiceId: parsed.voiceCast.voiceId,
          },
        });
      }
    }

    if (nextState) {
      appendStateSnapshot(nextState);
    }

    if (looksLikeClosingLanguage(customerReply) || looksLikeClosingLanguage(normalized)) {
      const triggerFromCustomer = looksLikeClosingLanguage(customerReply);
      appendCloseTriggerLog({
        trigger: "closing_phrase",
        accepted: terminalOutcome.isTerminal,
        reason: terminalOutcome.isTerminal
          ? terminalOutcome.terminalReason
          : "Closing language was ignored because the backend still reports unresolved complaint state.",
        source: triggerFromCustomer ? "customer" : "employee",
        blockedBy: terminalOutcome.blockedBy,
      });
      if (!terminalOutcome.isTerminal) {
        recordBlockedPrematureClosure({
          triggerSource: triggerFromCustomer ? "customer_reply_pattern" : "employee_wrap_up_language",
          triggerPhraseOrReason: triggerFromCustomer ? customerReply : normalized,
          source: "live_runtime",
          summary: triggerFromCustomer
            ? "Customer-sounding wrap-up language was ignored because the complaint still had unresolved gaps."
            : "Employee wrap-up language was blocked because the complaint still needed a concrete outcome.",
        });
        appendTurnEvent({
          type: "early_close_blocked",
          source: triggerFromCustomer ? "customer" : "employee",
          atMs: nowMs(startedAtRef.current),
          payload: {
            trigger: "closing_phrase",
            phrase: triggerFromCustomer ? customerReply : normalized,
            blockedBy: terminalOutcome.blockedBy,
          },
        });
      }
    }

    if (responseMode === "realtime") {
      pendingRealtimeTerminalValidationRef.current = terminalOutcome;
      appendTurnEvent({
        type: "customer_response_requested",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          terminalState: terminalOutcome.outcome,
          terminalValidated: terminalOutcome.isTerminal,
        },
      });
      sendClientEvent(buildRealtimeResponseCreateEvent({
        outputModalities: sessionBlueprintRef.current?.responseModalities || ["audio", "text"],
        instructions: parsed?.realtimeResponseInstructions,
      }));
      pendingRealtimeResponseRevisionRef.current = employeeSpeechRevisionRef.current;
      return;
    }

    appendTurnEvent({
      type: "customer_response_generated",
      source: "customer",
      atMs: nowMs(startedAtRef.current),
      payload: { text: customerReply, emotion },
    });
    appendTranscript("customer", customerReply, `customer-${Date.now()}`, emotion);
    appendTimingMarker("customer_reply_spoken");
    const playbackCompleted = await speakCustomerMessage(customerReply);
    if (!playbackCompleted) {
      return;
    }
    if (terminalOutcome.isTerminal) {
      appendTurnEvent({
        type: "terminal_state_accepted",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          outcome: terminalOutcome.outcome,
          reason: terminalOutcome.terminalReason,
          blockedBy: terminalOutcome.blockedBy,
        },
      });
      appendCloseTriggerLog({
        trigger: "backend_terminal_state",
        accepted: true,
        reason: terminalOutcome.terminalReason,
        source: "system",
        blockedBy: terminalOutcome.blockedBy,
      });
      shouldResumeRecognitionRef.current = false;
      appendTimingMarker("terminal_state_reached", terminalOutcome.terminalReason);
      cleanupConnection();
      setConnectionState("ended");
      return;
    }
    if (!isMuted && connectionState !== "ended" && connectionState !== "error") {
      startRecognition();
    }
  }, [appendCloseTriggerLog, appendStateSnapshot, appendTimingMarker, appendTranscript, appendTurnEvent, cleanupConnection, connectionState, getActiveVoiceCast, isMuted, params.scenario, processLiveTurn, recordBlockedPrematureClosure, sendClientEvent, speakCustomerMessage, startRecognition]);

  const flushPendingRealtimeEmployeeTurn = useCallback(async () => {
    if (realtimeTurnSequencerRef.current.isEmployeeSpeaking) {
      scheduleRealtimeEmployeeTurnFinalize("watchdog");
      return;
    }

    const consumedTurn = consumeRealtimeTurnSequencerState(
      realtimeTurnSequencerRef.current,
      `employee-${Date.now()}`,
    );
    realtimeTurnSequencerRef.current = consumedTurn.nextState;
    clearRealtimeTurnFinalizeTimer();

    const transcriptText = consumedTurn.transcriptText;
    const transcriptTurnKey = consumedTurn.transcriptTurnKey;
    if (!transcriptText) {
      return;
    }

    appendTranscript("employee", transcriptText, transcriptTurnKey);
    if (processingRealtimeTurnRef.current) {
      appendTurnEvent({
        type: "realtime_turn_merge_skipped_while_processing",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          transcriptText,
        },
      });
      return;
    }

    processingRealtimeTurnRef.current = true;
    try {
      const audioBlob = await stopEmployeeTurnCapture(false);
      const deliveryAnalysis = await analyzeEmployeeDelivery(audioBlob, transcriptText);
      await processEmployeeTurnThroughRuntime(transcriptText, deliveryAnalysis, "realtime", true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Realtime turn processing failed.";
      setLastError(message);
      setAssistantPhase("error");
      appendTimingMarker("realtime_turn_processing_error", message);
    } finally {
      processingRealtimeTurnRef.current = false;
    }

    if (looksLikeClosingLanguage(transcriptText)) {
      const validation = evaluateConversationTerminalState(latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1]);
      appendCloseTriggerLog({
        trigger: "transcript_finalized",
        accepted: validation.isTerminal,
        reason: validation.isTerminal
          ? validation.terminalReason
          : "Transcript finalization does not end the conversation without a validated terminal state.",
        source: "employee",
        blockedBy: validation.blockedBy,
      });
      if (!validation.isTerminal) {
        recordBlockedPrematureClosure({
          triggerSource: "transcript_finalized",
          triggerPhraseOrReason: transcriptText,
          source: "live_runtime",
          summary: "A finalized employee transcript sounded like a wrap-up, but the complaint still remained open.",
        });
        appendTurnEvent({
          type: "early_close_blocked",
          source: "employee",
          atMs: nowMs(startedAtRef.current),
          payload: {
            trigger: "transcript_finalized",
            phrase: transcriptText,
            blockedBy: validation.blockedBy,
          },
        });
      }
    }
  }, [
    analyzeEmployeeDelivery,
    appendCloseTriggerLog,
    appendTimingMarker,
    appendTranscript,
    appendTurnEvent,
    clearRealtimeTurnFinalizeTimer,
    processEmployeeTurnThroughRuntime,
    recordBlockedPrematureClosure,
    stopEmployeeTurnCapture,
  ]);

  const scheduleRealtimeEmployeeTurnFinalize = useCallback((strategy: "normal" | "watchdog" = "normal") => {
    clearRealtimeTurnFinalizeTimer();
    const mergedTranscript = realtimeTurnSequencerRef.current.pendingTranscriptSegments
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const baseDelayMs = getRealtimeEmployeeTurnFinalizeDelay(mergedTranscript);
    const delayMs = strategy === "watchdog"
      ? Math.max(baseDelayMs, 9000)
      : baseDelayMs;
    realtimeTurnFinalizeTimerRef.current = window.setTimeout(() => {
      void flushPendingRealtimeEmployeeTurn();
    }, delayMs);
  }, [clearRealtimeTurnFinalizeTimer, flushPendingRealtimeEmployeeTurn]);

  const enableLocalVoiceMode = useCallback(async (reason?: string) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMode("fallback");
      setConnectionState("fallback");
      setAssistantPhase("error");
      setLastError(reason || "Browser speech recognition is not available on this device.");
      appendTimingMarker("fallback", reason || "browser_recognition_unavailable");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      const finalTranscript = Array.from(event.results)
        .map((result) => {
          const transcript = result?.[0]?.transcript ?? "";
          if (!result?.isFinal) {
            interimTranscript += `${transcript} `;
            return "";
          }
          return transcript;
        })
        .join(" ")
        .trim();

      setDraftTranscript(interimTranscript.trim());

      if (!finalTranscript) {
        if (!isMuted) startRecognition();
        return;
      }

      shouldResumeRecognitionRef.current = false;
      void (async () => {
        const audioBlob = await stopEmployeeTurnCapture(false);
        const deliveryAnalysis = await analyzeEmployeeDelivery(audioBlob, finalTranscript);
        await processEmployeeTurnThroughRuntime(finalTranscript, deliveryAnalysis, "browser");
      })().catch((error) => {
        setLastError(error instanceof Error ? error.message : "Local voice turn failed.");
        setAssistantPhase("error");
        appendTimingMarker("local_voice_error", error instanceof Error ? error.message : "local_voice_turn_failed");
        if (!isMuted) startRecognition();
      });
    };

    recognition.onerror = (event) => {
      const errorCode = event.error || "speech_recognition_error";
      appendTimingMarker("speech_recognition_error", errorCode);
      setLastError(`Speech recognition error: ${errorCode}`);
      setAssistantPhase(errorCode === "not-allowed" ? "error" : "paused");
      void stopEmployeeTurnCapture(true);
      if (!isMuted && errorCode !== "not-allowed") {
        startRecognition();
      }
    };

    recognition.onend = () => {
      if (shouldResumeRecognitionRef.current && !isMuted && connectionState !== "ended" && connectionState !== "error") {
        startRecognition();
      }
    };

    recognitionRef.current = recognition;
    localVoiceEnabledRef.current = true;
    setVoiceMode("browser_voice");
    setConnectionState("connected");
    setLastError(reason ? `${reason} Using local live fallback mode.` : "Using local live fallback mode.");
    appendTimingMarker("local_voice_enabled", reason);

    appendTranscript(
      "customer",
      params.scenario.opening_line,
      `customer-opening-${params.scenario.scenario_id}`,
      params.scenario.customer_persona?.initial_emotion,
    );
    const openingPlaybackCompleted = await speakCustomerMessage(params.scenario.opening_line);
    if (!openingPlaybackCompleted) {
      return;
    }
    if (!isMuted) {
      startRecognition();
    }
  }, [appendTimingMarker, appendTranscript, connectionState, isMuted, params.scenario, processEmployeeTurnThroughRuntime, speakCustomerMessage, startRecognition]);

  const handleRealtimeEvent = useCallback(async (event: Record<string, unknown>) => {
    appendTurnEvent({
      type: String(event.type ?? "unknown_event"),
      source: "system",
      atMs: nowMs(startedAtRef.current),
      payload: event,
    });

    const type = String(event.type ?? "");

    if (type === "input_audio_buffer.speech_started") {
      const transition = applyRealtimeTurnSequencerEvent(realtimeTurnSequencerRef.current, {
        type: "input_audio_buffer.speech_started",
      });
      realtimeTurnSequencerRef.current = transition.nextState;
      employeeSpeechRevisionRef.current += 1;
      pendingRealtimeResponseRevisionRef.current = null;
      if (transition.clearFinalizeTimer) {
        clearRealtimeTurnFinalizeTimer();
      }
      appendTimingMarker("employee_speech_started");
      stopRenderedCustomerAudio(renderedCustomerAudioRef.current);
      renderedCustomerAudioRef.current = null;
      window.speechSynthesis?.cancel?.();
      startEmployeeTurnCapture();
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      const transition = applyRealtimeTurnSequencerEvent(realtimeTurnSequencerRef.current, {
        type: "input_audio_buffer.speech_stopped",
      });
      realtimeTurnSequencerRef.current = transition.nextState;
      appendTimingMarker("employee_speech_stopped");
      if (transition.finalizeDecision.shouldScheduleFinalize) {
        scheduleRealtimeEmployeeTurnFinalize(transition.finalizeDecision.strategy === "watchdog" ? "watchdog" : "normal");
      }
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcriptItemId = String(
        event.item_id
          ?? ((event.item as Record<string, unknown> | undefined)?.id)
          ?? "",
      ).trim();
      const transcriptText = extractTextFromUnknown(event.transcript ?? event.item);
      const transition = applyRealtimeTurnSequencerEvent(realtimeTurnSequencerRef.current, {
        type: "conversation.item.input_audio_transcription.completed",
        itemId: transcriptItemId || undefined,
        transcriptText: transcriptText || "",
        fallbackTurnKey: `employee-${transcriptItemId || Date.now()}`,
      });
      realtimeTurnSequencerRef.current = transition.nextState;
      if (transition.duplicateTranscriptIgnored) {
        appendTurnEvent({
          type: "duplicate_transcript_completion_ignored",
          source: "system",
          atMs: nowMs(startedAtRef.current),
          payload: {
            itemId: transcriptItemId || null,
          },
        });
        return;
      }
      if (transition.mergedTranscript) {
        setDraftTranscript(transition.mergedTranscript);
      }
      if (transition.finalizeDecision.shouldScheduleFinalize) {
        scheduleRealtimeEmployeeTurnFinalize(transition.finalizeDecision.strategy === "watchdog" ? "watchdog" : "normal");
      }
      return;
    }
    if (type === "response.audio_transcript.delta") {
      const id = String(event.response_id ?? event.item_id ?? "response");
      const delta = extractTextFromUnknown(event.delta) ?? "";
      customerTranscriptBufferRef.current.set(id, `${customerTranscriptBufferRef.current.get(id) ?? ""}${delta}`);
      return;
    }
    if (type === "response.output_text.delta" || type === "response.text.delta") {
      const id = String(event.response_id ?? event.item_id ?? "response");
      const delta = extractTextFromUnknown(event.delta ?? event.text) ?? "";
      customerTextBufferRef.current.set(id, `${customerTextBufferRef.current.get(id) ?? ""}${delta}`);
      return;
    }
    if (type === "response.audio_transcript.done") {
      const id = String(event.response_id ?? event.item_id ?? "response");
      const doneText = extractTextFromUnknown(event.transcript) ?? customerTranscriptBufferRef.current.get(id) ?? "";
      if (doneText.trim()) {
        appendTranscript("customer", doneText, `customer-${id}`);
      }
      customerTranscriptBufferRef.current.delete(id);
      return;
    }
    if (type === "response.output_text.done" || type === "response.text.done") {
      const id = String(event.response_id ?? event.item_id ?? "response");
      const doneText = extractTextFromUnknown(event.text ?? event.transcript) ?? customerTextBufferRef.current.get(id) ?? "";
      customerTextBufferRef.current.set(id, doneText);
      return;
    }
    if (type === "response.output_item.done") {
      const itemResponseId = String(
        event.response_id
          ?? ((event.response as Record<string, unknown> | undefined)?.id)
          ?? event.item_id
          ?? ((event.item as Record<string, unknown> | undefined)?.id)
          ?? "",
      ).trim();
      const itemText = extractAssistantTranscript(event);
      if (itemResponseId && itemText) {
        customerTextBufferRef.current.set(itemResponseId, itemText);
      }
      return;
    }
    if (isRealtimeResponseCompletionEvent(type)) {
      if (
        pendingRealtimeResponseRevisionRef.current !== null
        && pendingRealtimeResponseRevisionRef.current !== employeeSpeechRevisionRef.current
      ) {
        const staleResponseId = String(event.response_id ?? (event.response as Record<string, unknown> | undefined)?.id ?? null);
        appendTurnEvent({
          type: "stale_customer_response_ignored",
          source: "system",
          atMs: nowMs(startedAtRef.current),
          payload: {
            responseId: staleResponseId,
            requestRevision: pendingRealtimeResponseRevisionRef.current,
            currentRevision: employeeSpeechRevisionRef.current,
          },
        });
        if (staleResponseId) {
          customerTextBufferRef.current.delete(staleResponseId);
          customerTranscriptBufferRef.current.delete(staleResponseId);
        }
        pendingRealtimeTerminalValidationRef.current = null;
        pendingRealtimeResponseRevisionRef.current = null;
        return;
      }
      const responseId = String(event.response_id ?? (event.response as Record<string, unknown> | undefined)?.id ?? Date.now());
      if (!claimRealtimeResponseCompletion(processedRealtimeResponseIdsRef.current, responseId)) {
        customerTextBufferRef.current.delete(responseId);
        customerTranscriptBufferRef.current.delete(responseId);
        return;
      }
      const responseText = extractAssistantTranscript(event)
        ?? customerTextBufferRef.current.get(responseId)
        ?? customerTranscriptBufferRef.current.get(responseId)
        ?? null;
      if (responseText) {
        appendTranscript("customer", responseText, `customer-${responseId}`);
        appendTurnEvent({
          type: "customer_response_generated",
          source: "customer",
          atMs: nowMs(startedAtRef.current),
          payload: {
            text: responseText,
            terminalState: pendingRealtimeTerminalValidationRef.current?.isTerminal ?? false,
          },
        });
        if (looksLikeClosingLanguage(responseText)) {
          const validation = evaluateConversationTerminalState(latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1]);
          appendCloseTriggerLog({
            trigger: "closing_phrase",
            accepted: validation.isTerminal,
            reason: validation.isTerminal
              ? validation.terminalReason
              : "Wrap-up language was ignored because the complaint remains open.",
            source: "customer",
            blockedBy: validation.blockedBy,
          });
          if (!validation.isTerminal) {
            recordBlockedPrematureClosure({
              triggerSource: "customer_reply_pattern",
              triggerPhraseOrReason: responseText,
              source: "live_runtime",
              summary: "Customer wrap-up language was ignored because the complaint still needed a real outcome or accepted path forward.",
            });
            appendTurnEvent({
              type: "early_close_blocked",
              source: "customer",
              atMs: nowMs(startedAtRef.current),
              payload: {
                trigger: "closing_phrase",
                phrase: responseText,
                blockedBy: validation.blockedBy,
              },
            });
          }
        }
      }
      customerTextBufferRef.current.delete(responseId);
      customerTranscriptBufferRef.current.delete(responseId);
      if (responseText && sessionBlueprintRef.current?.audioOutputMode === "external-rendered") {
        const playbackCompleted = await speakCustomerMessage(responseText);
        if (!playbackCompleted) {
          return;
        }
      }
      const pendingTerminal = pendingRealtimeTerminalValidationRef.current;
      const completionDecision = resolveRealtimeResponseCompletion(pendingTerminal);
      pendingRealtimeResponseRevisionRef.current = null;
      if (completionDecision.shouldEndSession) {
        appendTurnEvent({
          type: "terminal_state_accepted",
          source: "system",
          atMs: nowMs(startedAtRef.current),
          payload: {
            outcome: pendingTerminal?.isTerminal ? latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1]?.terminal_outcome_state : null,
            reason: completionDecision.terminalReason || "Backend validated a terminal outcome.",
            blockedBy: completionDecision.blockedBy,
          },
        });
        appendCloseTriggerLog({
          trigger: "backend_terminal_state",
          accepted: true,
          reason: completionDecision.terminalReason || "Backend validated a terminal outcome.",
          source: "system",
          blockedBy: completionDecision.blockedBy,
        });
        appendTimingMarker("terminal_state_reached", completionDecision.terminalReason || "Backend validated a terminal outcome.");
        pendingRealtimeTerminalValidationRef.current = null;
        cleanupConnection();
        setConnectionState("ended");
        return;
      }
      pendingRealtimeTerminalValidationRef.current = null;
      setAssistantPhase("listening");
      return;
    }
    if (type === "error") {
      const message = extractRealtimeErrorMessage(event) ?? "Realtime session reported an error.";
      setLastError(message);
      setConnectionState("error");
      setAssistantPhase("error");
      appendTimingMarker("realtime_error", message);
    }
  }, [appendCloseTriggerLog, appendTimingMarker, appendTranscript, appendTurnEvent, cleanupConnection, clearRealtimeTurnFinalizeTimer, recordBlockedPrematureClosure, scheduleRealtimeEmployeeTurnFinalize, speakCustomerMessage, startEmployeeTurnCapture]);

  const startSelfVideo = useCallback(async () => {
    if (selfVideoStreamRef.current) {
      setSelfVideoEnabled(true);
      setSelfVideoStream(selfVideoStreamRef.current);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      selfVideoStreamRef.current = stream;
      setSelfVideoStream(stream);
      setSelfVideoEnabled(true);
      appendTimingMarker("self_video_enabled");
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Unable to enable self video.");
      setSelfVideoEnabled(false);
    }
  }, [appendTimingMarker]);

  const stopSelfVideo = useCallback(() => {
    selfVideoStreamRef.current?.getTracks().forEach(track => track.stop());
    selfVideoStreamRef.current = null;
    setSelfVideoStream(null);
    setSelfVideoEnabled(false);
    appendTimingMarker("self_video_disabled");
  }, [appendTimingMarker]);

  const toggleSelfVideo = useCallback(async () => {
    if (selfVideoEnabled) {
      stopSelfVideo();
      return;
    }
    await startSelfVideo();
  }, [selfVideoEnabled, startSelfVideo, stopSelfVideo]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    audioStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted;
    });
    if (localVoiceEnabledRef.current) {
      if (nextMuted) {
        stopRecognition();
      } else {
        startRecognition();
      }
    }
    setIsMuted(nextMuted);
    if (localVoiceEnabledRef.current) {
      setAssistantPhase(nextMuted ? "paused" : "listening");
    }
    appendTimingMarker(nextMuted ? "muted" : "unmuted");
  }, [appendTimingMarker, isMuted, startRecognition, stopRecognition]);

  const endCall = useCallback(() => {
    appendTimingMarker("call_ended");
    const latestState = latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1];
    const manualExit = deriveManualExitDisposition(latestState);
    appendCloseTriggerLog({
      trigger: "manual_exit",
      accepted: manualExit.accepted_as_terminal,
      reason: manualExit.reason,
      source: "system",
      blockedBy: manualExit.blockedBy,
    });
    if (manualExit.should_append_failure_outcome) {
      appendFailureStateSnapshot({
        eventType: "abandonment_detected",
        source: "client",
        summary: "The live conversation ended before a valid resolution or escalation was earned.",
      });
    }
    cleanupConnection();
    setConnectionState("ended");
  }, [appendCloseTriggerLog, appendFailureStateSnapshot, appendTimingMarker, cleanupConnection]);

  const startCall = useCallback(async () => {
    if (connectionState !== "idle") return;
    const startTimestamp = Date.now();
    liveSessionIdRef.current = `live-${params.scenario.scenario_id}-${startTimestamp}`;
    startedAtRef.current = startTimestamp;
    setStartedAt(startTimestamp);
    setElapsedMs(0);
    setLastError(null);
    setDeliveryAnalysisError(null);
    setLastDeliveryAnalysis(null);
    sessionBlueprintRef.current = null;
    pendingRealtimeTerminalValidationRef.current = null;
    processingRealtimeTurnRef.current = false;
    processedRealtimeResponseIdsRef.current.clear();
    realtimeTurnSequencerRef.current = createRealtimeTurnSequencerState();
    pendingRealtimeResponseRevisionRef.current = null;
    setDraftTranscript("");
    setVoiceMode("fallback");
    setAssistantPhase("setup");
    setConnectionState("requesting_permissions");
    appendTimingMarker("call_requested");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setConnectionState("fallback");
      setAssistantPhase("error");
      setLastError("This device does not support realtime audio sessions.");
      appendTimingMarker("fallback", "browser_unsupported");
      return;
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = audioStream;
      appendTimingMarker("microphone_ready");
    } catch (error) {
      setConnectionState("fallback");
      setAssistantPhase("error");
      setLastError(error instanceof Error ? error.message : "Microphone permission was denied.");
      appendTimingMarker("fallback", "microphone_unavailable");
      return;
    }

    setConnectionState("requesting_credentials");
    let credentialResponse: Awaited<ReturnType<typeof createCredentials.mutateAsync>>;
    try {
      credentialResponse = await withTimeout(
        createCredentials.mutateAsync({
          scenarioJson: params.scenario,
          employeeRole: params.config.employeeRole,
          sessionSeed: liveSessionIdRef.current,
        }),
        5000,
        "Live session setup timed out.",
      );
    } catch (error) {
      failLiveVoiceSession(
        "Realtime session setup failed before the live call could start.",
        error instanceof Error ? error.message : "realtime_setup_failed",
      );
      return;
    }
    sessionBlueprintRef.current = credentialResponse;
    if (credentialResponse.voiceCast) {
      browserSpeechVoiceRef.current = chooseBrowserSpeechVoice(credentialResponse.voiceCast);
      appendTurnEvent({
        type: "audio_provider_selected",
        source: "system",
        atMs: nowMs(startedAtRef.current),
        payload: {
          scope: "session_start",
          provider: credentialResponse.voiceCast.provider,
          voiceId: credentialResponse.voiceCast.voiceId,
          fallbackProviders: credentialResponse.voiceCast.fallbackProviders,
          audioOutputMode: credentialResponse.audioOutputMode,
        },
      });
    }

    if (!credentialResponse.enabled || !credentialResponse.clientSecret) {
      if (credentialResponse.allowLocalBrowserFallback) {
        await enableLocalVoiceMode(credentialResponse.reason || "Realtime credentials unavailable.");
        return;
      }
      failLiveVoiceSession(
        "Live voice could not start because the provider-backed realtime session is unavailable.",
        credentialResponse.reason || "realtime_credentials_unavailable",
      );
      return;
    }

    setConnectionState("connecting");
    appendTimingMarker("credential_received");

    try {
      const peerConnection = new RTCPeerConnection();
      setVoiceMode("realtime");
      peerRef.current = peerConnection;
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudio.muted = credentialResponse.audioOutputMode !== "realtime-native";
      remoteAudioRef.current = remoteAudio;

      audioStreamRef.current?.getAudioTracks().forEach(track => {
        peerConnection.addTrack(track, audioStreamRef.current as MediaStream);
      });

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === "connected") {
          setConnectionState("connected");
          setAssistantPhase("listening");
          appendTimingMarker("peer_connected");
        } else if (state === "connecting") {
          setConnectionState("connecting");
        } else if (state === "disconnected") {
          setConnectionState("reconnecting");
          appendTimingMarker("peer_disconnected");
        } else if (state === "failed") {
          failLiveVoiceSession("Live audio connection failed.", "peer_failed");
        }
      };

      const dataChannel = peerConnection.createDataChannel("wsc-live-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        appendTimingMarker("data_channel_open");
        sendClientEvent(buildRealtimeResponseCreateEvent({
          outputModalities: credentialResponse.responseModalities,
          instructions: credentialResponse.openingResponseInstructions,
        }));
      };
      dataChannel.onmessage = (messageEvent) => {
        try {
          const event = JSON.parse(String(messageEvent.data)) as Record<string, unknown>;
          void handleRealtimeEvent(event);
        } catch {
          appendTurnEvent({
            type: "unparsed_event",
            source: "system",
            atMs: nowMs(startedAtRef.current),
            payload: { raw: String(messageEvent.data) },
          });
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      appendTimingMarker("offer_created");

      const sdpResponse = await fetch(credentialResponse.connectionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialResponse.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });

      if (!sdpResponse.ok) {
        const errorBody = await sdpResponse.text().catch(() => "");
        const suffix = errorBody ? `: ${errorBody.slice(0, 400)}` : "";
        throw new Error(`SDP exchange failed (${sdpResponse.status} ${sdpResponse.statusText})${suffix}`);
      }

      const answerSdp = await sdpResponse.text();
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      appendTimingMarker("answer_received");
    } catch (error) {
      if (credentialResponse.allowLocalBrowserFallback) {
        await enableLocalVoiceMode(error instanceof Error ? error.message : "Realtime connection failed.");
        return;
      }
      failLiveVoiceSession(
        "Realtime connection failed before the call could continue.",
        error instanceof Error ? error.message : "realtime_connection_failed",
      );
    }
  }, [appendTimingMarker, appendTurnEvent, connectionState, createCredentials, enableLocalVoiceMode, failLiveVoiceSession, handleRealtimeEvent, params.config.employeeRole, params.scenario, sendClientEvent]);

  useEffect(() => {
    if (!startedAt || (connectionState !== "connected" && connectionState !== "connecting" && connectionState !== "reconnecting")) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setElapsedMs(nowMs(startedAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connectionState, startedAt]);

  useEffect(() => {
    if (!startedAtRef.current) return undefined;
    if (!["connected", "reconnecting", "fallback"].includes(connectionState)) return undefined;

    const latestState = latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1];
    if (isTerminalConversationState(latestState)) return undefined;

    const timer = window.setTimeout(() => {
      appendCloseTriggerLog({
        trigger: "timeout_failure",
        accepted: true,
        reason: "Inactivity timeout converted the live session into an explicit failure outcome.",
        source: "system",
      });
      appendTimingMarker("timeout_failure", "No meaningful turn activity before inactivity timeout.");
      appendFailureStateSnapshot({
        eventType: "timeout_failure",
        source: "live_runtime",
        summary: "Live conversation timed out after inactivity before a valid terminal state was reached.",
      });
      cleanupConnection();
      setConnectionState("ended");
      setAssistantPhase("error");
      setLastError("Live conversation timed out before the issue was resolved.");
    }, LIVE_SESSION_INACTIVITY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [appendCloseTriggerLog, appendFailureStateSnapshot, appendTimingMarker, cleanupConnection, connectionState, stateHistory.length, transcript.length, turnEvents.length]);

  useEffect(() => {
    return () => {
      cleanupConnection();
    };
  }, [cleanupConnection]);

  const formattedDuration = useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [elapsedMs]);

  const repeatLastCustomerMessage = useCallback(async () => {
    const lastCustomerTurn = [...latestTranscriptRef.current].reverse().find((turn) => turn.role === "customer");
    if (!lastCustomerTurn) return;
    const playbackCompleted = await speakCustomerMessage(lastCustomerTurn.message);
    if (!playbackCompleted) {
      return;
    }
    if (!isMuted && localVoiceEnabledRef.current && connectionState === "connected") {
      startRecognition();
    }
  }, [connectionState, isMuted, speakCustomerMessage, startRecognition]);

  const submitManualResponse = useCallback(async (message: string) => {
    if (!localVoiceEnabledRef.current) return;
    stopRecognition();
    await processEmployeeTurnThroughRuntime(message, null, "browser");
  }, [processEmployeeTurnThroughRuntime, stopRecognition]);

  return {
    connectionState,
    voiceMode,
    assistantPhase,
    lastError,
    draftTranscript,
    isMuted,
    selfVideoEnabled,
    selfVideoStream,
    transcript,
    stateHistory,
    turnEvents,
    timingMarkers,
    formattedDuration,
    turnCaptureStatus,
    lastDeliveryAnalysis,
    deliveryAnalysisError,
    sessionActive: runtimeView.session_active,
    backendTerminalState: runtimeView.backend_terminal_state,
    terminalStateValidated: runtimeView.terminal_state_validated,
    complaintStillOpen: runtimeView.complaint_still_open,
    prematureEndAttemptDetected: runtimeView.premature_end_attempt_detected,
    unresolvedGapDetected: runtimeView.unresolved_gap_detected,
    liveRuntimeFailureState: runtimeView.live_runtime_failure_state,
    terminalValidationReason: runtimeView.terminal_validation_reason,
    completionBlockers: runtimeView.completion_blockers,
    startCall,
    endCall,
    toggleMute,
    toggleSelfVideo,
    repeatLastCustomerMessage,
    submitManualResponse,
    resumeListening: startRecognition,
    pauseListening: stopRecognition,
    credentialPending: createCredentials.isPending,
  };
}
