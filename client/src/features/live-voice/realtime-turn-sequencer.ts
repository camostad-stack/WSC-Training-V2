import {
  mergeRealtimeTranscriptSegments,
  resolveRealtimeTranscriptFinalize,
  type RealtimeTranscriptFinalizeDecision,
} from "./realtime-control";
import { claimRealtimeTranscriptItem } from "./realtime-protocol";

export type RealtimeTurnSequencerState = {
  processedTranscriptItemIds: Set<string>;
  pendingTranscriptSegments: string[];
  pendingTurnKey: string | null;
  isEmployeeSpeaking: boolean;
  observedSpeechStopForPendingTurn: boolean;
};

export type RealtimeTurnSequencerEvent =
  | {
    type: "input_audio_buffer.speech_started";
  }
  | {
    type: "input_audio_buffer.speech_stopped";
  }
  | {
    type: "conversation.item.input_audio_transcription.completed";
    itemId?: string | null;
    transcriptText: string;
    fallbackTurnKey: string;
  };

export type RealtimeTurnSequencerResult = {
  nextState: RealtimeTurnSequencerState;
  clearFinalizeTimer: boolean;
  mergedTranscript: string;
  pendingTurnKey: string | null;
  duplicateTranscriptIgnored: boolean;
  finalizeDecision: RealtimeTranscriptFinalizeDecision;
};

export function createRealtimeTurnSequencerState(): RealtimeTurnSequencerState {
  return {
    processedTranscriptItemIds: new Set<string>(),
    pendingTranscriptSegments: [],
    pendingTurnKey: null,
    isEmployeeSpeaking: false,
    observedSpeechStopForPendingTurn: false,
  };
}

function buildFinalizeDecision(state: RealtimeTurnSequencerState): RealtimeTranscriptFinalizeDecision {
  return resolveRealtimeTranscriptFinalize({
    hasPendingTranscript: state.pendingTranscriptSegments.length > 0,
    isEmployeeCurrentlySpeaking: state.isEmployeeSpeaking,
    observedSpeechStopForPendingTurn: state.observedSpeechStopForPendingTurn,
  });
}

function buildTranscriptCompletionFinalizeDecision(
  state: RealtimeTurnSequencerState,
): RealtimeTranscriptFinalizeDecision {
  if (state.pendingTranscriptSegments.length === 0) {
    return { shouldScheduleFinalize: false, strategy: "none" };
  }

  // Realtime occasionally delivers a completed transcript before the matching
  // speech-stopped signal. Keep a watchdog armed so a missed stop does not
  // strand the turn forever.
  if (!state.observedSpeechStopForPendingTurn) {
    return { shouldScheduleFinalize: true, strategy: "watchdog" };
  }

  return buildFinalizeDecision(state);
}

export function applyRealtimeTurnSequencerEvent(
  state: RealtimeTurnSequencerState,
  event: RealtimeTurnSequencerEvent,
): RealtimeTurnSequencerResult {
  const nextState: RealtimeTurnSequencerState = {
    processedTranscriptItemIds: new Set(state.processedTranscriptItemIds),
    pendingTranscriptSegments: [...state.pendingTranscriptSegments],
    pendingTurnKey: state.pendingTurnKey,
    isEmployeeSpeaking: state.isEmployeeSpeaking,
    observedSpeechStopForPendingTurn: state.observedSpeechStopForPendingTurn,
  };

  if (event.type === "input_audio_buffer.speech_started") {
    nextState.isEmployeeSpeaking = true;
    nextState.observedSpeechStopForPendingTurn = false;
    return {
      nextState,
      clearFinalizeTimer: true,
      mergedTranscript: mergeRealtimeTranscriptSegments(nextState.pendingTranscriptSegments),
      pendingTurnKey: nextState.pendingTurnKey,
      duplicateTranscriptIgnored: false,
      finalizeDecision: { shouldScheduleFinalize: false, strategy: "none" },
    };
  }

  if (event.type === "input_audio_buffer.speech_stopped") {
    nextState.isEmployeeSpeaking = false;
    nextState.observedSpeechStopForPendingTurn = true;
    return {
      nextState,
      clearFinalizeTimer: false,
      mergedTranscript: mergeRealtimeTranscriptSegments(nextState.pendingTranscriptSegments),
      pendingTurnKey: nextState.pendingTurnKey,
      duplicateTranscriptIgnored: false,
      finalizeDecision: buildFinalizeDecision(nextState),
    };
  }

  const itemId = event.itemId?.trim();
  if (!claimRealtimeTranscriptItem(nextState.processedTranscriptItemIds, itemId || undefined)) {
    return {
      nextState,
      clearFinalizeTimer: false,
      mergedTranscript: mergeRealtimeTranscriptSegments(nextState.pendingTranscriptSegments),
      pendingTurnKey: nextState.pendingTurnKey,
      duplicateTranscriptIgnored: true,
      finalizeDecision: { shouldScheduleFinalize: false, strategy: "none" },
    };
  }

  const transcriptText = event.transcriptText.trim();
  if (transcriptText) {
    nextState.pendingTranscriptSegments = [
      ...nextState.pendingTranscriptSegments,
      transcriptText,
    ];
    nextState.pendingTurnKey = nextState.pendingTurnKey || event.fallbackTurnKey;
  }

  return {
    nextState,
    clearFinalizeTimer: false,
    mergedTranscript: mergeRealtimeTranscriptSegments(nextState.pendingTranscriptSegments),
    pendingTurnKey: nextState.pendingTurnKey,
    duplicateTranscriptIgnored: false,
    finalizeDecision: buildTranscriptCompletionFinalizeDecision(nextState),
  };
}

export function consumeRealtimeTurnSequencerState(
  state: RealtimeTurnSequencerState,
  fallbackTurnKey: string,
) {
  return {
    transcriptText: mergeRealtimeTranscriptSegments(state.pendingTranscriptSegments),
    transcriptTurnKey: state.pendingTurnKey || fallbackTurnKey,
    nextState: {
      ...state,
      pendingTranscriptSegments: [],
      pendingTurnKey: null,
      observedSpeechStopForPendingTurn: false,
    } satisfies RealtimeTurnSequencerState,
  };
}
