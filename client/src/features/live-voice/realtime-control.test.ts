import { describe, expect, it } from "vitest";

import {
  getRealtimeEmployeeTurnFinalizeDelay,
  looksLikeIncompleteEmployeeTurn,
  mergeRealtimeTranscriptSegments,
  resolveRealtimeTranscriptFinalize,
  resolveRealtimeResponseCompletion,
} from "./realtime-control";

describe("resolveRealtimeResponseCompletion", () => {
  it("ends the session from backend terminal validation even if no transcript text is present", () => {
    const decision = resolveRealtimeResponseCompletion({
      isTerminal: true,
      terminalReason: "Conversation reached a validated resolution.",
      blockedBy: [],
    });

    expect(decision.shouldEndSession).toBe(true);
    expect(decision.shouldKeepSessionActive).toBe(false);
    expect(decision.terminalReason).toBe("Conversation reached a validated resolution.");
  });

  it("keeps the session active when the backend has not validated a terminal outcome", () => {
    const decision = resolveRealtimeResponseCompletion({
      isTerminal: false,
      terminalReason: "Conversation is still active and cannot end yet.",
      blockedBy: ["unresolved_complaint_persists"],
    });

    expect(decision.shouldEndSession).toBe(false);
    expect(decision.shouldKeepSessionActive).toBe(true);
    expect(decision.blockedBy).toContain("unresolved_complaint_persists");
  });

  it("defaults to keeping the session active when no backend validation is pending", () => {
    const decision = resolveRealtimeResponseCompletion(null);

    expect(decision.shouldEndSession).toBe(false);
    expect(decision.shouldKeepSessionActive).toBe(true);
    expect(decision.terminalReason).toBeNull();
  });

  it("merges adjacent transcript fragments into one employee turn", () => {
    expect(mergeRealtimeTranscriptSegments([
      "And what’s the direct line",
      "or email for that team?",
      "I want to reach out if I don’t hear back.",
    ])).toBe("And what’s the direct line or email for that team? I want to reach out if I don’t hear back.");
  });

  it("holds clearly unfinished employee turns longer before finalizing", () => {
    expect(looksLikeIncompleteEmployeeTurn("Yes, so I can")).toBe(true);
    expect(getRealtimeEmployeeTurnFinalizeDelay("Yes, so I can")).toBe(5600);
    expect(getRealtimeEmployeeTurnFinalizeDelay("I can explain the two charges, and")).toBe(4200);
    expect(looksLikeIncompleteEmployeeTurn("Yes, I can do that.")).toBe(false);
    expect(getRealtimeEmployeeTurnFinalizeDelay("Yes, I can do that.")).toBe(1000);
    expect(getRealtimeEmployeeTurnFinalizeDelay("Yep")).toBe(1900);
  });

  it("does not finalize a pending transcript until speech has actually stopped", () => {
    expect(resolveRealtimeTranscriptFinalize({
      hasPendingTranscript: true,
      isEmployeeCurrentlySpeaking: true,
      observedSpeechStopForPendingTurn: false,
    })).toEqual({
      shouldScheduleFinalize: false,
      strategy: "none",
    });

    expect(resolveRealtimeTranscriptFinalize({
      hasPendingTranscript: true,
      isEmployeeCurrentlySpeaking: false,
      observedSpeechStopForPendingTurn: false,
    })).toEqual({
      shouldScheduleFinalize: true,
      strategy: "watchdog",
    });

    expect(resolveRealtimeTranscriptFinalize({
      hasPendingTranscript: true,
      isEmployeeCurrentlySpeaking: false,
      observedSpeechStopForPendingTurn: true,
    })).toEqual({
      shouldScheduleFinalize: true,
      strategy: "normal",
    });
  });
});
