export type PendingBackendTerminalValidation = {
  isTerminal: boolean;
  terminalReason: string;
  blockedBy: string[];
} | null;

export type RealtimeResponseCompletionDecision = {
  shouldEndSession: boolean;
  shouldKeepSessionActive: boolean;
  terminalReason: string | null;
  blockedBy: string[];
};

export type RealtimeTranscriptFinalizeDecision = {
  shouldScheduleFinalize: boolean;
  strategy: "none" | "normal" | "watchdog";
};

const INCOMPLETE_ENDING_PATTERNS = [
  /(?:^|\s)(and|or|but|so|because|if|when|then|that|to|for|with|about|into|from)$/i,
  /(?:^|\s)(i|we|you|they|he|she)\s+(can|could|will|would|should|have|need)\s*$/i,
  /(?:^|\s)(a|an|the|my|your|our|their)\s+[a-z]+$/i,
];

export function mergeRealtimeTranscriptSegments(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeIncompleteEmployeeTurn(text: string) {
  const normalized = text.trim();
  if (!normalized) return true;
  if (/[.!?]["']?$/.test(normalized)) return false;
  if (/[,:;—-]\s*$/.test(normalized) || /\.\.\.\s*$/.test(normalized)) return true;
  return INCOMPLETE_ENDING_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getRealtimeEmployeeTurnFinalizeDelay(text: string) {
  const normalized = text.trim();
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;

  if (looksLikeIncompleteEmployeeTurn(normalized)) {
    if (wordCount <= 6 || normalized.length <= 32) {
      return 5600;
    }
    return 4200;
  }

  if (!/[.!?]["']?$/.test(normalized) && wordCount <= 4) {
    return 1900;
  }

  return 1000;
}

export function resolveRealtimeTranscriptFinalize(params: {
  hasPendingTranscript: boolean;
  isEmployeeCurrentlySpeaking: boolean;
  observedSpeechStopForPendingTurn: boolean;
}): RealtimeTranscriptFinalizeDecision {
  if (!params.hasPendingTranscript) {
    return { shouldScheduleFinalize: false, strategy: "none" };
  }

  if (params.isEmployeeCurrentlySpeaking) {
    return { shouldScheduleFinalize: false, strategy: "none" };
  }

  if (!params.observedSpeechStopForPendingTurn) {
    return { shouldScheduleFinalize: true, strategy: "watchdog" };
  }

  return { shouldScheduleFinalize: true, strategy: "normal" };
}

export function resolveRealtimeResponseCompletion(
  pendingValidation: PendingBackendTerminalValidation,
): RealtimeResponseCompletionDecision {
  if (pendingValidation?.isTerminal) {
    return {
      shouldEndSession: true,
      shouldKeepSessionActive: false,
      terminalReason: pendingValidation.terminalReason,
      blockedBy: pendingValidation.blockedBy || [],
    };
  }

  return {
    shouldEndSession: false,
    shouldKeepSessionActive: true,
    terminalReason: pendingValidation?.terminalReason || null,
    blockedBy: pendingValidation?.blockedBy || [],
  };
}
