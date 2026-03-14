import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "../../_core/env";
import { createCustomerVoiceCast } from "./casting";
import type { ScenarioDirectorResult } from "../ai/contracts";

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return {
    scenario_id: "voice-cast-billing",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Jordan Miles",
      age_band: "35-45",
      membership_context: "Long-time member",
      communication_style: "direct and skeptical",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member wants a concrete answer about duplicate billing.",
    opening_line: "I need to know why I was charged twice.",
    hidden_facts: ["One charge is pending and one is final."],
    approved_resolution_paths: ["Verify the billing and give a concrete next step."],
    required_behaviors: ["Take ownership", "Give a real next step"],
    critical_errors: ["Blame the member"],
    branch_logic: {},
    emotion_progression: { starting_state: "frustrated", better_if: [], worse_if: [] },
    completion_rules: { resolved_if: [], end_early_if: [], manager_required_if: [] },
    recommended_turns: 4,
    ...overrides,
  };
}

describe("customer voice casting", () => {
  const originalVoiceRenderAllowBrowserNativeFallback = ENV.voiceRenderAllowBrowserNativeFallback;

  afterEach(() => {
    ENV.voiceRenderAllowBrowserNativeFallback = originalVoiceRenderAllowBrowserNativeFallback;
  });

  it("rotates voices and cadence across session seeds", () => {
    const scenario = createScenario();
    const first = createCustomerVoiceCast({ scenario, sessionSeed: "session-one", preferredProvider: "openai-realtime-native" });
    const second = createCustomerVoiceCast({ scenario, sessionSeed: "session-two", preferredProvider: "openai-realtime-native" });

    expect(`${first.voiceId}:${first.cadenceFingerprint}`).not.toBe(`${second.voiceId}:${second.cadenceFingerprint}`);
  });

  it("can cast a browser-native session when realtime is unavailable", () => {
    const cast = createCustomerVoiceCast({
      scenario: createScenario(),
      sessionSeed: "browser-seed",
      preferredProvider: "browser-native-speech",
    });

    expect(cast.provider).toBe("browser-native-speech");
    expect(cast.voiceId).toContain("browser-");
  });

  it("can assign a Cartesia voice profile without changing the session-level cast shape", () => {
    ENV.voiceRenderAllowBrowserNativeFallback = false;
    const cast = createCustomerVoiceCast({
      scenario: createScenario(),
      sessionSeed: "cartesia-seed",
      preferredProvider: "cartesia",
    });

    expect(cast.provider).toBe("cartesia");
    expect(cast.voiceId).toMatch(/[a-f0-9-]{8,}/);
    expect(cast.providerCapabilities.supportsCustomVoices).toBe(true);
    expect(cast.fallbackProviders).not.toContain("browser-native-speech");
    expect(cast.stylePrompt.length).toBeGreaterThan(20);
    expect(cast.personaArchetype.length).toBeGreaterThan(4);
  });

  it("links frustrated direct personas to a brisker, sharper delivery profile", () => {
    const cast = createCustomerVoiceCast({
      scenario: createScenario({
        customer_persona: {
          name: "Alicia",
          age_band: "30-40",
          membership_context: "Upset parent",
          communication_style: "blunt and impatient",
          initial_emotion: "angry",
          patience_level: "low",
        },
      }),
      sessionSeed: "sharp-seed",
      preferredProvider: "openai-realtime-native",
    });

    expect(cast.pace).toBe("brisk");
    expect(cast.sharpness).toBe("edgy");
    expect(cast.energy).toBe("high");
    expect(cast.personaArchetype).toBe("blunt_low_patience");
  });

  it("does not reuse the exact same default session cast constantly across multiple seeds", () => {
    const scenario = createScenario();
    const casts = [
      createCustomerVoiceCast({ scenario, sessionSeed: "seed-a", preferredProvider: "cartesia" }),
      createCustomerVoiceCast({ scenario, sessionSeed: "seed-b", preferredProvider: "cartesia" }),
      createCustomerVoiceCast({ scenario, sessionSeed: "seed-c", preferredProvider: "cartesia" }),
    ];

    const uniqueSignatureCount = new Set(casts.map((cast) => `${cast.voiceId}:${cast.cadenceFingerprint}`)).size;
    expect(uniqueSignatureCount).toBeGreaterThan(1);
  });

  it("preserves voice identity for intentional repeat callers", () => {
    const scenario = createScenario({
      repeat_caller_key: "member-jordan-miles",
      preserve_caller_voice: true,
    } as Partial<ScenarioDirectorResult>);

    const first = createCustomerVoiceCast({ scenario, sessionSeed: "repeat-one", preferredProvider: "cartesia" });
    const second = createCustomerVoiceCast({ scenario, sessionSeed: "repeat-two", preferredProvider: "cartesia" });

    expect(second.voiceId).toBe(first.voiceId);
    expect(second.cadenceFingerprint).toBe(first.cadenceFingerprint);
    expect(second.repeatCallerKey).toBe("member-jordan-miles");
    expect(second.preserveCallerVoice).toBe(true);
  });
});
