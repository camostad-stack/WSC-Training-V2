import { describe, expect, it } from "vitest";
import { getLiveVoiceGuidance } from "./ux";

describe("getLiveVoiceGuidance", () => {
  it("guides first-time users through microphone permission", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "requesting_permissions",
      voiceMode: "browser_voice",
      assistantPhase: "setup",
      isMuted: false,
      transcriptTurns: 0,
    });

    expect(result.title).toContain("microphone");
    expect(result.tone).toBe("warning");
  });

  it("tells the employee to listen while the customer is speaking", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "connected",
      voiceMode: "browser_voice",
      assistantPhase: "customer_speaking",
      isMuted: false,
      transcriptTurns: 2,
    });

    expect(result.title).toContain("Caller is speaking");
    expect(result.detail).toContain("finish");
  });

  it("keeps listening guidance generic instead of coaching to hidden criteria", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "connected",
      voiceMode: "browser_voice",
      assistantPhase: "listening",
      isMuted: false,
      transcriptTurns: 3,
    });

    expect(result.title).toContain("Your turn");
    expect(result.tone).toBe("info");
    expect(result.detail.toLowerCase()).not.toContain("next step");
    expect(result.detail.toLowerCase()).not.toContain("criteria");
  });

  it("keeps unresolved-call guidance human and does not expose hidden state labels", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "connected",
      voiceMode: "browser_voice",
      assistantPhase: "listening",
      isMuted: false,
      transcriptTurns: 7,
      latestState: {
        turn_number: 4,
        emotion_state: "guarded",
        trust_level: 4,
        issue_clarity: 5,
        unresolved_questions: ["Who is actually following up with me, and when?"],
        unmet_completion_criteria: ["customer acknowledged next step or escalation"],
        premature_closure_detected: true,
      },
    });

    expect(result.title).toContain("still active");
    expect(result.detail.toLowerCase()).not.toContain("following up");
    expect(result.detail.toLowerCase()).not.toContain("completion");
    expect(result.tone).toBe("warning");
  });

  it("treats timeout as a failure state instead of a successful ending", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "ended",
      voiceMode: "browser_voice",
      assistantPhase: "error",
      isMuted: false,
      transcriptTurns: 6,
      liveRuntimeFailureState: "timeout_failure",
    });

    expect(result.title).toContain("timed out");
    expect(result.tone).toBe("danger");
  });

  it("shows a terminal message only when the backend has validated a terminal outcome", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "connected",
      voiceMode: "browser_voice",
      assistantPhase: "processing",
      isMuted: false,
      transcriptTurns: 6,
      terminalStateValidated: true,
      latestState: {
        turn_number: 6,
        emotion_state: "calm",
        trust_level: 8,
        issue_clarity: 8,
        terminal_validation_reason: "Conversation reached a validated resolution.",
      },
    });

    expect(result.title).toContain("Call ended");
    expect(result.detail).toContain("ready for review");
  });
});
