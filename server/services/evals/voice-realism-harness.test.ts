import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../../_core/env";
import {
  formatVoiceAndRealismEvalReport,
  runVoiceAndRealismEvalHarness,
} from "./voice-realism-harness";
import { buildVoiceAndRealismEvalDataset } from "./voice-realism-datasets";
import { defaultVoiceCastingService } from "../voice-rendering";

function buildVoiceFetchMock(options?: {
  failCartesia?: boolean;
  failOpenAI?: boolean;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("cartesia")) {
      if (options?.failCartesia) {
        return {
          ok: false,
          status: 503,
          statusText: "Unavailable",
          headers: new Headers({ "content-type": "application/json" }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => new TextEncoder().encode("cartesia-audio").buffer,
      };
    }

    if (options?.failOpenAI) {
      return {
        ok: false,
        status: 503,
        statusText: "Unavailable",
        headers: new Headers({ "content-type": "application/json" }),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new TextEncoder().encode("openai-audio").buffer,
    };
  });
}

describe("voice + realism eval harness", () => {
  const originalCartesiaApiKey = ENV.cartesiaApiKey;
  const originalOpenaiApiKey = ENV.openaiApiKey;

  afterEach(() => {
    ENV.cartesiaApiKey = originalCartesiaApiKey;
    ENV.openaiApiKey = originalOpenaiApiKey;
    defaultVoiceCastingService.reset();
    vi.restoreAllMocks();
  });

  it("grades complaint-resolution correctness, premature closure resistance, and long-call realism", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.openaiApiKey = "openai-key";

    const report = await runVoiceAndRealismEvalHarness({
      fetchFn: buildVoiceFetchMock() as typeof fetch,
    });

    const politeUnresolved = report.conversationCases.find((item) => item.id === "polite-but-unresolved");
    const vagueNextStep = report.conversationCases.find((item) => item.id === "vague-next-step");
    const invalidEscalation = report.conversationCases.find((item) => item.id === "invalid-escalation");
    const properEscalation = report.conversationCases.find((item) => item.id === "proper-escalation");
    const trueResolution = report.conversationCases.find((item) => item.id === "true-resolution");
    const trustRecovery = report.conversationCases.find((item) => item.id === "trust-decline-recovery");
    const longCall = report.conversationCases.find((item) => item.id === "long-call-realism");

    expect(politeUnresolved?.validEnding).toBe(true);
    expect(["ACTIVE", "PARTIALLY_RESOLVED"]).toContain(politeUnresolved?.actualTerminalOutcome);

    expect(vagueNextStep?.validEnding).toBe(true);
    expect(vagueNextStep?.actorReopenedGap).toBe(true);
    expect(vagueNextStep?.turns.some((turn) => turn.prematureClosureBlocked)).toBe(true);

    expect(invalidEscalation?.validEnding).toBe(true);
    expect(["ACTIVE", "PARTIALLY_RESOLVED"]).toContain(invalidEscalation?.actualTerminalOutcome);

    expect(properEscalation?.validEnding).toBe(true);
    expect(properEscalation?.actualTerminalOutcome).toBe("ESCALATED");

    expect(trueResolution?.validEnding).toBe(true);
    expect(trueResolution?.actualTerminalOutcome).toBe("RESOLVED");

    expect(trustRecovery?.trustRecovered).toBe(true);
    expect(trustRecovery?.deliveryShiftWithTrust).toBe(true);

    expect(longCall?.validEnding).toBe(true);
    expect(longCall?.complaintStayedOpenAsExpected).toBe(true);
    expect(["ACTIVE", "PARTIALLY_RESOLVED"]).toContain(longCall?.actualTerminalOutcome);

    expect(report.summary.complaintResolutionCorrectness).toBeGreaterThanOrEqual(85);
    expect(report.summary.prematureClosureResistance).toBeGreaterThanOrEqual(80);
    expect(report.summary.longCallRealism).toBeGreaterThanOrEqual(85);
  });

  it("captures provider metrics, rotation behavior, and repeat-caller consistency", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.openaiApiKey = "openai-key";

    const report = await runVoiceAndRealismEvalHarness({
      fetchFn: buildVoiceFetchMock() as typeof fetch,
    });

    expect(report.voiceProviderSamples.every((sample) => sample.comparisonStatus === "completed")).toBe(true);
    expect(report.providerMetrics.map((metric) => metric.provider)).toEqual(
      expect.arrayContaining(["cartesia", "openai-native-speech"]),
    );

    const multiCast = report.voiceRotationCases.find((item) => item.id === "same-complaint-multi-cast");
    const repeatCaller = report.voiceRotationCases.find((item) => item.id === "repeat-caller-consistency");

    expect(multiCast?.uniqueVoiceCount).toBeGreaterThan(1);
    expect(multiCast?.uniqueCadenceCount).toBeGreaterThan(1);
    expect(multiCast?.sameBotFeelScore).toBeGreaterThanOrEqual(70);

    expect(repeatCaller?.repeatCallerConsistency).toBe(true);
    expect(repeatCaller?.uniqueVoiceCount).toBe(1);
  });

  it("records provider fallback cleanly in the A/B metrics", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.openaiApiKey = "openai-key";

    const dataset = buildVoiceAndRealismEvalDataset();
    const report = await runVoiceAndRealismEvalHarness({
      dataset: {
        ...dataset,
        conversationCases: [],
        voiceRotationCases: [],
        voiceProviderSamples: [dataset.voiceProviderSamples[0]],
      },
      fetchFn: buildVoiceFetchMock({ failCartesia: true }) as typeof fetch,
    });

    const sample = report.voiceProviderSamples[0];
    expect(sample.comparisonStatus).toBe("completed");
    expect(sample.comparison?.samples[0].requestedProvider).toBe("cartesia");
    expect(sample.comparison?.samples[0].didFallback).toBe(true);
    expect(sample.comparison?.samples[0].finalProvider).toBe("openai-native-speech");

    const openaiMetric = report.providerMetrics.find((metric) => metric.provider === "openai-native-speech");
    expect(openaiMetric?.fallbackRate).toBeGreaterThan(0);
    expect(report.flags).toContain("High fallback rate: openai-native-speech");
  });

  it("formats a readable dashboard report", async () => {
    ENV.cartesiaApiKey = "cartesia-key";
    ENV.openaiApiKey = "openai-key";

    const report = await runVoiceAndRealismEvalHarness({
      fetchFn: buildVoiceFetchMock() as typeof fetch,
    });
    const formatted = formatVoiceAndRealismEvalReport(report);

    expect(formatted).toContain("Voice + Realism Eval Report");
    expect(formatted).toContain("Conversation Cases");
    expect(formatted).toContain("Voice Provider Samples");
    expect(formatted).toContain("Voice Rotation");
  });
});
