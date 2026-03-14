import type { SimulationStateSnapshot } from "@/features/simulator/types";
import { isTerminalConversationState } from "@shared/conversation-outcome";

export type LiveVoiceMode = "realtime" | "browser_voice" | "fallback";
export type LiveVoiceAssistantPhase =
  | "setup"
  | "customer_speaking"
  | "listening"
  | "processing"
  | "paused"
  | "ended"
  | "error";

export type LiveVoiceGuidance = {
  title: string;
  detail: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
};

export function getLiveVoiceGuidance(params: {
  connectionState: string;
  voiceMode: LiveVoiceMode;
  assistantPhase: LiveVoiceAssistantPhase;
  isMuted: boolean;
  transcriptTurns: number;
  latestState?: SimulationStateSnapshot | null;
  sessionActive?: boolean;
  terminalStateValidated?: boolean;
  complaintStillOpen?: boolean;
  liveRuntimeFailureState?: "timeout_failure" | "abandonment_detected" | null;
  lastError?: string | null;
}): LiveVoiceGuidance {
  if (params.connectionState === "fallback" || params.voiceMode === "fallback") {
    return {
      title: "Voice unavailable here",
      detail: "This device or server setup cannot keep the call live. Switch to a typed conversation for this caller.",
      tone: "warning",
    };
  }

  if (params.connectionState === "requesting_permissions") {
    return {
      title: "Allow microphone access",
      detail: "The call cannot begin until microphone permission is granted in the browser.",
      tone: "warning",
    };
  }

  if (params.connectionState === "requesting_credentials" || params.connectionState === "connecting" || params.connectionState === "reconnecting") {
    return {
      title: "Connecting the call",
      detail: "Stay on this screen while the call connects.",
      tone: "info",
    };
  }

  if (params.connectionState === "error") {
    return {
      title: "Voice session hit an error",
      detail: params.lastError || "Use typed fallback or end the call and try again.",
      tone: "danger",
    };
  }

  if (params.liveRuntimeFailureState === "timeout_failure") {
    return {
      title: "Call timed out",
      detail: "The caller never reached a clear outcome before the call timed out.",
      tone: "danger",
    };
  }

  if (params.terminalStateValidated) {
    return {
      title: "Call ended",
      detail: "The call has reached a valid ending and is ready for review.",
      tone: "neutral",
    };
  }

  if (params.assistantPhase === "customer_speaking") {
    return {
      title: "Caller is speaking",
      detail: "Let them finish before you answer.",
      tone: "info",
    };
  }

  if (params.assistantPhase === "processing") {
    return {
      title: "Caller is responding",
      detail: "Hold for the next reply.",
      tone: "info",
    };
  }

  if (params.assistantPhase === "paused" || params.isMuted) {
    return {
      title: "Mic is paused",
      detail: "Resume the mic when you are ready to answer. You can also type a reply below.",
      tone: "warning",
    };
  }

  if (params.connectionState === "connected" && params.transcriptTurns <= 1) {
    return {
      title: "Call is live",
      detail: "Listen to the caller and answer in your own words.",
      tone: "info",
    };
  }

  const latestState = params.latestState;
  if (latestState && !isTerminalConversationState(latestState)) {
    if (latestState.premature_closure_detected) {
      return {
        title: "Call is still active",
        detail: "The caller is still expecting more from the conversation.",
        tone: "warning",
      };
    }

    if (params.complaintStillOpen || params.sessionActive) {
      return {
        title: "Stay with the call",
        detail: "Keep listening and responding until the caller is genuinely ready to end.",
        tone: "info",
      };
    }
  }

  if (params.assistantPhase === "listening") {
    return {
      title: "Your turn",
      detail: "Answer naturally and keep the conversation moving.",
      tone: "info",
    };
  }

  return {
    title: "Get ready to respond",
    detail: "Listen to the customer, then answer clearly in your own words.",
    tone: "neutral",
  };
}
