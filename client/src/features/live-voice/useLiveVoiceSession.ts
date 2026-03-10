import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { ScenarioCard, SimulatorConfig, TimingMarker, LiveTurnEvent, ConversationTurn } from "@/features/simulator/types";

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

export function useLiveVoiceSession(params: {
  scenario: ScenarioCard;
  config: SimulatorConfig;
}) {
  const createCredentials = trpc.liveVoice.createCredentials.useMutation();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const selfVideoStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const transcriptKeysRef = useRef<Set<string>>(new Set());
  const customerTranscriptBufferRef = useRef<Map<string, string>>(new Map());
  const [connectionState, setConnectionState] = useState<LiveConnectionState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [selfVideoEnabled, setSelfVideoEnabled] = useState(false);
  const [selfVideoStream, setSelfVideoStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<ConversationTurn[]>([]);
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

  const stopStreams = useCallback(() => {
    audioStreamRef.current?.getTracks().forEach(track => track.stop());
    audioStreamRef.current = null;
    selfVideoStreamRef.current?.getTracks().forEach(track => track.stop());
    selfVideoStreamRef.current = null;
    setSelfVideoStream(null);
  }, []);

  const cleanupConnection = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    startedAtRef.current = null;
    stopStreams();
  }, [stopStreams]);

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
    setIsMuted(nextMuted);
    appendTimingMarker(nextMuted ? "muted" : "unmuted");
  }, [appendTimingMarker, isMuted]);

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
    setConnectionState("requesting_permissions");
    appendTimingMarker("call_requested");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setConnectionState("fallback");
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
      setConnectionState("fallback");
      setLastError(credentialResponse.reason || "Live voice credentials are unavailable.");
      appendTimingMarker("fallback", credentialResponse.reason);
      return;
    }

    setConnectionState("connecting");
    appendTimingMarker("credential_received");

    try {
      const peerConnection = new RTCPeerConnection();
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
          appendTimingMarker("peer_connected");
        } else if (state === "connecting") {
          setConnectionState("connecting");
        } else if (state === "disconnected") {
          setConnectionState("reconnecting");
          appendTimingMarker("peer_disconnected");
        } else if (state === "failed") {
          setConnectionState("fallback");
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
      setConnectionState("fallback");
      setLastError(error instanceof Error ? error.message : "Failed to start live call.");
      appendTimingMarker("fallback", error instanceof Error ? error.message : "connection_error");
    }
  }, [appendTimingMarker, appendTurnEvent, connectionState, createCredentials, handleRealtimeEvent, params.config.employeeRole, params.scenario, sendClientEvent]);

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

  return {
    connectionState,
    lastError,
    isMuted,
    selfVideoEnabled,
    selfVideoStream,
    transcript,
    turnEvents,
    timingMarkers,
    formattedDuration,
    startCall,
    endCall,
    toggleMute,
    toggleSelfVideo,
    credentialPending: createCredentials.isPending,
  };
}
