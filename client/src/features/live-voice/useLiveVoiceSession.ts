import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { ScenarioCard, SimulatorConfig, TimingMarker, LiveTurnEvent, ConversationTurn, SimulationStateSnapshot } from "@/features/simulator/types";
import type { LiveVoiceAssistantPhase, LiveVoiceMode } from "@/features/live-voice/ux";

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
      ?? event.item
      ?? event.response,
  );
}

function splitIntoSpeechChunks(message: string) {
  return message
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const name = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase().startsWith("en-us")) score += 6;
  if (voice.lang.toLowerCase().startsWith("en")) score += 3;
  if (/natural|neural|premium|enhanced/.test(name)) score += 5;
  if (/samantha|ava|allison|victoria|zoe|google us english|microsoft aria|microsoft jenny/.test(name)) score += 6;
  if (/female|woman/.test(name)) score += 1;
  if (/compact|espeak/.test(name)) score -= 10;
  return score;
}

function chooseBestSpeechVoice() {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

export function useLiveVoiceSession(params: {
  scenario: ScenarioCard;
  config: SimulatorConfig;
}) {
  const createCredentials = trpc.liveVoice.createCredentials.useMutation();
  const simulateTurn = trpc.simulator.customerReply.useMutation();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const selfVideoStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const shouldResumeRecognitionRef = useRef(false);
  const localVoiceEnabledRef = useRef(false);
  const latestTranscriptRef = useRef<ConversationTurn[]>([]);
  const latestStateHistoryRef = useRef<SimulationStateSnapshot[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const transcriptKeysRef = useRef<Set<string>>(new Set());
  const customerTranscriptBufferRef = useRef<Map<string, string>>(new Map());
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

  const appendTimingMarker = useCallback((name: string, detail?: string) => {
    setTimingMarkers(prev => [...prev, { name, atMs: nowMs(startedAtRef.current), detail }]);
  }, []);

  const appendTurnEvent = useCallback((event: LiveTurnEvent) => {
    setTurnEvents(prev => [...prev, event]);
  }, []);

  const appendTranscript = useCallback((role: "customer" | "employee", message: string, key: string, emotion?: string) => {
    const normalized = message.trim();
    if (!normalized || transcriptKeysRef.current.has(key)) return;
    transcriptKeysRef.current.add(key);
    setTranscript(prev => [...prev, { role, message: normalized, emotion, timestamp: Date.now() }]);
  }, []);

  const appendStateSnapshot = useCallback((snapshot: SimulationStateSnapshot) => {
    setStateHistory((prev) => [...prev, snapshot]);
  }, []);

  useEffect(() => {
    latestTranscriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    latestStateHistoryRef.current = stateHistory;
  }, [stateHistory]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return undefined;
    const assignVoice = () => {
      speechVoiceRef.current = chooseBestSpeechVoice();
    };
    assignVoice();
    window.speechSynthesis.onvoiceschanged = assignVoice;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const stopStreams = useCallback(() => {
    audioStreamRef.current?.getTracks().forEach(track => track.stop());
    audioStreamRef.current = null;
    selfVideoStreamRef.current?.getTracks().forEach(track => track.stop());
    selfVideoStreamRef.current = null;
    setSelfVideoStream(null);
  }, []);

  const cleanupConnection = useCallback(() => {
    shouldResumeRecognitionRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    localVoiceEnabledRef.current = false;
    setDraftTranscript("");
    window.speechSynthesis?.cancel?.();
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
  }, [stopStreams]);

  const speakCustomerMessage = useCallback(async (message: string) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    setAssistantPhase("customer_speaking");
    if (!speechVoiceRef.current) {
      speechVoiceRef.current = chooseBestSpeechVoice();
    }

    const personaStyle = `${params.scenario.customer_persona?.communication_style || ""} ${params.scenario.customer_persona?.initial_emotion || ""}`.toLowerCase();
    const rate = /frustrated|angry|direct/.test(personaStyle) ? 0.96 : /calm|neutral/.test(personaStyle) ? 0.98 : 1;
    const pitch = /frustrated|angry/.test(personaStyle) ? 0.92 : /friendly|warm/.test(personaStyle) ? 1.02 : 0.98;
    const chunks = splitIntoSpeechChunks(message);

    for (const chunk of chunks) {
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = 1;
        if (speechVoiceRef.current) {
          utterance.voice = speechVoiceRef.current;
        }
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    }
  }, [params.scenario.customer_persona]);

  const stopRecognition = useCallback(() => {
    shouldResumeRecognitionRef.current = false;
    recognitionRef.current?.stop();
    if (localVoiceEnabledRef.current) {
      setAssistantPhase("paused");
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current || isMuted || connectionState === "ended" || connectionState === "error") return;
    shouldResumeRecognitionRef.current = true;
    if (localVoiceEnabledRef.current) {
      setAssistantPhase("listening");
    }
    try {
      recognitionRef.current.start();
    } catch {
      // Browser speech recognition throws if start() is called twice.
    }
  }, [connectionState, isMuted]);

  const runLocalEmployeeTurn = useCallback(async (employeeMessage: string) => {
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
    appendTranscript("employee", normalized, `employee-${Date.now()}`);

    const employeeTurn: ConversationTurn = {
      role: "employee",
      message: normalized,
      timestamp: Date.now(),
    };

    const priorState = latestStateHistoryRef.current[latestStateHistoryRef.current.length - 1];
    const transcriptPayload = [...latestTranscriptRef.current, employeeTurn].map((turn) => ({
      role: turn.role,
      message: turn.message,
      emotion: turn.emotion,
    }));

    const result = await simulateTurn.mutateAsync({
      scenarioJson: params.scenario,
      transcript: transcriptPayload,
      employeeResponse: normalized,
      stateJson: priorState
        ? {
            turn_number: priorState.turn_number,
            emotion_state: priorState.emotion_state,
            trust_level: priorState.trust_level,
            issue_clarity: priorState.issue_clarity,
            employee_flags: priorState.employee_flags ?? {},
            escalation_required: priorState.escalation_required ?? false,
            scenario_risk_level: priorState.scenario_risk_level ?? "moderate",
          }
        : {
            turn_number: 0,
            emotion_state: params.scenario.customer_persona?.initial_emotion || "frustrated",
            trust_level: 3,
            issue_clarity: 3,
            employee_flags: {},
            escalation_required: false,
            scenario_risk_level: "moderate",
          },
    });

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    const reply = parsed?.customerReply || parsed?.customer_reply || {};
    const nextState = parsed?.stateUpdate || parsed?.state_update || null;
    const customerReply = reply.customer_reply || parsed.customer_reply || "...";
    const emotion = reply.updated_emotion || parsed.updated_emotion || nextState?.emotion_state || params.scenario.customer_persona?.initial_emotion;

    appendTurnEvent({
      type: "customer_response_generated",
      source: "customer",
      atMs: nowMs(startedAtRef.current),
      payload: { text: customerReply, emotion },
    });
    appendTranscript("customer", customerReply, `customer-${Date.now()}`, emotion);
    if (nextState) {
      appendStateSnapshot(nextState);
    }

    appendTimingMarker("customer_reply_spoken");
    await speakCustomerMessage(customerReply);
    if (reply.scenario_complete || nextState?.continue_simulation === false) {
      shouldResumeRecognitionRef.current = false;
      setAssistantPhase("ready_to_wrap");
      return;
    }
    if (!isMuted && connectionState !== "ended" && connectionState !== "error") {
      startRecognition();
    }
  }, [appendStateSnapshot, appendTimingMarker, appendTranscript, appendTurnEvent, connectionState, isMuted, params.scenario, simulateTurn, speakCustomerMessage, startRecognition]);

  const enableLocalVoiceMode = useCallback(async (reason?: string) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || typeof window.speechSynthesis === "undefined") {
      setVoiceMode("fallback");
      setConnectionState("fallback");
      setAssistantPhase("error");
      setLastError(reason || "Browser voice features are not available on this device.");
      appendTimingMarker("fallback", reason || "browser_voice_unavailable");
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
      void runLocalEmployeeTurn(finalTranscript).catch((error) => {
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
    setLastError(reason ? `${reason} Using browser voice mode.` : "Using browser voice mode.");
    appendTimingMarker("local_voice_enabled", reason);

    appendTranscript(
      "customer",
      params.scenario.opening_line,
      `customer-opening-${params.scenario.scenario_id}`,
      params.scenario.customer_persona?.initial_emotion,
    );
    await speakCustomerMessage(params.scenario.opening_line);
    if (!isMuted) {
      startRecognition();
    }
  }, [appendTimingMarker, appendTranscript, connectionState, isMuted, params.scenario, runLocalEmployeeTurn, speakCustomerMessage, startRecognition]);

  const handleRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    appendTurnEvent({
      type: String(event.type ?? "unknown_event"),
      source: "system",
      atMs: nowMs(startedAtRef.current),
      payload: event,
    });

    const type = String(event.type ?? "");

    if (type === "input_audio_buffer.speech_started") {
      appendTimingMarker("employee_speech_started");
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      appendTimingMarker("employee_speech_stopped");
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcriptText = extractTextFromUnknown(event.transcript ?? event.item);
      if (transcriptText) {
        appendTranscript("employee", transcriptText, `employee-${String(event.item_id ?? Date.now())}`);
      }
      return;
    }
    if (type === "response.audio_transcript.delta") {
      const id = String(event.response_id ?? event.item_id ?? "response");
      const delta = extractTextFromUnknown(event.delta) ?? "";
      customerTranscriptBufferRef.current.set(id, `${customerTranscriptBufferRef.current.get(id) ?? ""}${delta}`);
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
    if (type === "response.output_item.done" || type === "response.done") {
      const responseText = extractAssistantTranscript(event);
      if (responseText) {
        const responseId = String(event.response_id ?? (event.response as Record<string, unknown> | undefined)?.id ?? Date.now());
        appendTranscript("customer", responseText, `customer-${responseId}`);
      }
      return;
    }
    if (type === "error") {
      const message = extractTextFromUnknown(event.error) ?? "Realtime session reported an error.";
      setLastError(message);
      setConnectionState("error");
      setAssistantPhase("error");
      appendTimingMarker("realtime_error", message);
    }
  }, [appendTimingMarker, appendTranscript, appendTurnEvent]);

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
    cleanupConnection();
    setConnectionState("ended");
  }, [appendTimingMarker, cleanupConnection]);

  const startCall = useCallback(async () => {
    if (connectionState !== "idle") return;
    const startTimestamp = Date.now();
    startedAtRef.current = startTimestamp;
    setStartedAt(startTimestamp);
    setElapsedMs(0);
    setLastError(null);
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
    const credentialResponse = await createCredentials.mutateAsync({
      scenarioJson: params.scenario,
      employeeRole: params.config.employeeRole,
    });

    if (!credentialResponse.enabled || !credentialResponse.clientSecret) {
      await enableLocalVoiceMode(credentialResponse.reason || "Realtime credentials unavailable.");
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
          setVoiceMode("fallback");
          setConnectionState("fallback");
          setAssistantPhase("error");
          setLastError("Live audio connection failed.");
          appendTimingMarker("fallback", "peer_failed");
        }
      };

      const dataChannel = peerConnection.createDataChannel("wsc-live-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        appendTimingMarker("data_channel_open");
        sendClientEvent({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: `Start the conversation now by speaking the opening line naturally. Opening line: ${params.scenario.opening_line}`,
          },
        });
      };
      dataChannel.onmessage = (messageEvent) => {
        try {
          const event = JSON.parse(String(messageEvent.data)) as Record<string, unknown>;
          handleRealtimeEvent(event);
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
        throw new Error(`SDP exchange failed (${sdpResponse.status} ${sdpResponse.statusText})`);
      }

      const answerSdp = await sdpResponse.text();
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      appendTimingMarker("answer_received");
    } catch (error) {
      await enableLocalVoiceMode(error instanceof Error ? error.message : "Realtime connection failed.");
    }
  }, [appendTimingMarker, appendTurnEvent, connectionState, createCredentials, enableLocalVoiceMode, handleRealtimeEvent, params.config.employeeRole, params.scenario, sendClientEvent]);

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
    await speakCustomerMessage(lastCustomerTurn.message);
    if (!isMuted && localVoiceEnabledRef.current && connectionState === "connected") {
      startRecognition();
    }
  }, [connectionState, isMuted, speakCustomerMessage, startRecognition]);

  const submitManualResponse = useCallback(async (message: string) => {
    if (!localVoiceEnabledRef.current) return;
    stopRecognition();
    await runLocalEmployeeTurn(message);
  }, [runLocalEmployeeTurn, stopRecognition]);

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
