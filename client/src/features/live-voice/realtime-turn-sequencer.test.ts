import { describe, expect, it } from "vitest";

import {
  applyRealtimeTurnSequencerEvent,
  consumeRealtimeTurnSequencerState,
  createRealtimeTurnSequencerState,
  flushRealtimeTurnSequencerState,
} from "./realtime-turn-sequencer";

describe("realtime-turn-sequencer", () => {
  it("finalizes normally when speech stops before the transcript completion arrives", () => {
    let state = createRealtimeTurnSequencerState();

    let result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_started",
    });
    state = result.nextState;

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_stopped",
    });
    state = result.nextState;
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: false,
      strategy: "none",
    });

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_stop_first",
      transcriptText: "I can pull up that account now.",
      fallbackTurnKey: "employee-stop-first",
    });
    state = result.nextState;

    expect(result.mergedTranscript).toBe("I can pull up that account now.");
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "normal",
    });

    const consumed = consumeRealtimeTurnSequencerState(state, "employee-fallback");
    expect(consumed.transcriptText).toBe("I can pull up that account now.");
    expect(consumed.transcriptTurnKey).toBe("employee-stop-first");
  });

  it("merges a slight pause back into one employee turn across the actual realtime event sequence", () => {
    let state = createRealtimeTurnSequencerState();

    let result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_started",
    });
    state = result.nextState;
    expect(result.clearFinalizeTimer).toBe(true);
    expect(result.finalizeDecision.shouldScheduleFinalize).toBe(false);

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_1",
      transcriptText: "Yes, so I can",
      fallbackTurnKey: "employee-item_1",
    });
    state = result.nextState;
    expect(result.mergedTranscript).toBe("Yes, so I can");
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "watchdog",
    });

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_stopped",
    });
    state = result.nextState;
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "normal",
    });

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_started",
    });
    state = result.nextState;
    expect(result.clearFinalizeTimer).toBe(true);
    expect(result.finalizeDecision.shouldScheduleFinalize).toBe(false);

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_2",
      transcriptText: "help with that charge today.",
      fallbackTurnKey: "employee-item_2",
    });
    state = result.nextState;
    expect(result.mergedTranscript).toBe("Yes, so I can help with that charge today.");
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "watchdog",
    });

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_stopped",
    });
    state = result.nextState;
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "normal",
    });

    const consumed = consumeRealtimeTurnSequencerState(state, "employee-fallback");
    expect(consumed.transcriptText).toBe("Yes, so I can help with that charge today.");
    expect(consumed.transcriptTurnKey).toBe("employee-item_1");
    expect(consumed.nextState.pendingTranscriptSegments).toEqual([]);
    expect(consumed.nextState.observedSpeechStopForPendingTurn).toBe(false);
  });

  it("uses a watchdog finalize strategy when transcript completion arrives without a matching speech stop", () => {
    let state = createRealtimeTurnSequencerState();

    const result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_watchdog",
      transcriptText: "I can check that billing issue for you",
      fallbackTurnKey: "employee-watchdog",
    });
    state = result.nextState;

    expect(result.mergedTranscript).toBe("I can check that billing issue for you");
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "watchdog",
    });

    const consumed = consumeRealtimeTurnSequencerState(state, "employee-fallback");
    expect(consumed.transcriptText).toBe("I can check that billing issue for you");
  });

  it("keeps a watchdog armed when speech started arrived but speech stopped never does", () => {
    let state = createRealtimeTurnSequencerState();

    let result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_started",
    });
    state = result.nextState;

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_missing_stop",
      transcriptText: "Let me pull up the account details",
      fallbackTurnKey: "employee-missing-stop",
    });
    state = result.nextState;

    expect(result.mergedTranscript).toBe("Let me pull up the account details");
    expect(result.finalizeDecision).toEqual({
      shouldScheduleFinalize: true,
      strategy: "watchdog",
    });

    const flushed = flushRealtimeTurnSequencerState(state, {
      fallbackTurnKey: "employee-fallback",
      trigger: "watchdog",
    });

    expect(flushed.shouldDefer).toBe(false);
    expect(flushed.transcriptText).toBe("Let me pull up the account details");
    expect(flushed.transcriptTurnKey).toBe("employee-missing-stop");
    expect(flushed.nextState.isEmployeeSpeaking).toBe(false);
  });

  it("ignores duplicate transcript completions for the same realtime item", () => {
    let state = createRealtimeTurnSequencerState();

    let result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_dup",
      transcriptText: "First fragment",
      fallbackTurnKey: "employee-dup",
    });
    state = result.nextState;
    expect(result.duplicateTranscriptIgnored).toBe(false);

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_dup",
      transcriptText: "First fragment",
      fallbackTurnKey: "employee-dup",
    });

    expect(result.duplicateTranscriptIgnored).toBe(true);
    expect(result.mergedTranscript).toBe("First fragment");
  });

  it("starts the next turn cleanly after a buffered turn is consumed", () => {
    let state = createRealtimeTurnSequencerState();

    let result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_old",
      transcriptText: "First turn",
      fallbackTurnKey: "employee-old",
    });
    state = result.nextState;

    const consumed = consumeRealtimeTurnSequencerState(state, "employee-fallback");
    state = consumed.nextState;

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_new",
      transcriptText: "Second turn",
      fallbackTurnKey: "employee-new",
    });

    expect(result.mergedTranscript).toBe("Second turn");
    expect(result.pendingTurnKey).toBe("employee-new");
    expect(result.nextState.observedSpeechStopForPendingTurn).toBe(false);
  });

  it("defers a normal flush while the employee is still marked as speaking", () => {
    let state = createRealtimeTurnSequencerState();

    let result = applyRealtimeTurnSequencerEvent(state, {
      type: "input_audio_buffer.speech_started",
    });
    state = result.nextState;

    result = applyRealtimeTurnSequencerEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      itemId: "item_defer",
      transcriptText: "I can explain the two charges",
      fallbackTurnKey: "employee-defer",
    });
    state = result.nextState;

    const flushed = flushRealtimeTurnSequencerState(state, {
      fallbackTurnKey: "employee-fallback",
      trigger: "normal",
    });

    expect(flushed.shouldDefer).toBe(true);
    expect(flushed.nextFinalizeStrategy).toBe("watchdog");
    expect(flushed.transcriptText).toBe("");
    expect(flushed.nextState.pendingTranscriptSegments).toEqual(["I can explain the two charges"]);
  });
});
