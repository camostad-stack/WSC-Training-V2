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

export function mergeRealtimeTranscriptSegments(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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
