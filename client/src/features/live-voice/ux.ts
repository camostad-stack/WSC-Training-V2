export type LiveVoiceMode = "realtime" | "browser_voice" | "fallback";
export type LiveVoiceAssistantPhase =
  | "setup"
  | "customer_speaking"
  | "listening"
  | "processing"
  | "paused"
  | "ready_to_wrap"
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
  employeeTurns: number;
  recommendedTurns: number;
  lastError?: string | null;
}): LiveVoiceGuidance {
  if (params.connectionState === "fallback" || params.voiceMode === "fallback") {
    return {
      title: "Voice unavailable here",
      detail: "This device or server setup cannot complete a live voice call. Use text practice for this exact scenario instead.",
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
      detail: "Stay on this screen. The voice session is still setting up.",
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

  if (params.assistantPhase === "customer_speaking") {
    return {
      title: "Listen first",
      detail: "The customer is talking. Wait for them to finish, then give a direct answer and next step.",
      tone: "info",
    };
  }

  if (params.assistantPhase === "processing") {
    return {
      title: "Customer is responding",
      detail: "Hold for the next customer reply. The system is processing your last answer.",
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

  if (params.assistantPhase === "ready_to_wrap") {
    return {
      title: "Ready to finish",
      detail: "You have enough conversation saved for scoring. End the call now, or give one more clean closing response.",
      tone: "success",
    };
  }

  if (params.connectionState === "connected" && params.transcriptTurns <= 1) {
    return {
      title: "Start with a calm first answer",
      detail: "Acknowledge the problem, explain what you will check, and give the next concrete step.",
      tone: "info",
    };
  }

  if (params.assistantPhase === "listening") {
    const turnsRemaining = Math.max(0, params.recommendedTurns - params.employeeTurns);
    return {
      title: "Speak naturally",
      detail: turnsRemaining > 0
        ? `Aim for ${Math.max(3, params.recommendedTurns)} total employee turns. Keep your answer direct and practical.`
        : "You can close this out now if the issue is resolved.",
      tone: "success",
    };
  }

  if (params.connectionState === "ended") {
    return {
      title: "Call ended",
      detail: "The session is being saved and prepared for scoring.",
      tone: "neutral",
    };
  }

  return {
    title: "Get ready to respond",
    detail: "Listen to the customer, then answer clearly in your own words.",
    tone: "neutral",
  };
}
