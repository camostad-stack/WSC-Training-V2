import { describe, expect, it } from "vitest";

import { resolveRealtimeResponseCompletion } from "./realtime-control";

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
});
