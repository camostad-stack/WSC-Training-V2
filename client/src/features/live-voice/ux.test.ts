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
      employeeTurns: 0,
      recommendedTurns: 4,
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
      employeeTurns: 0,
      recommendedTurns: 4,
    });

    expect(result.title).toContain("Listen");
    expect(result.detail).toContain("customer is talking");
  });

  it("encourages a direct response while the mic is listening", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "connected",
      voiceMode: "browser_voice",
      assistantPhase: "listening",
      isMuted: false,
      transcriptTurns: 3,
      employeeTurns: 1,
      recommendedTurns: 4,
    });

    expect(result.title).toContain("Speak");
    expect(result.tone).toBe("success");
  });

  it("tells the employee they can wrap once enough turns are captured", () => {
    const result = getLiveVoiceGuidance({
      connectionState: "connected",
      voiceMode: "browser_voice",
      assistantPhase: "ready_to_wrap",
      isMuted: false,
      transcriptTurns: 7,
      employeeTurns: 3,
      recommendedTurns: 4,
    });

    expect(result.title).toContain("finish");
    expect(result.tone).toBe("success");
  });
});
