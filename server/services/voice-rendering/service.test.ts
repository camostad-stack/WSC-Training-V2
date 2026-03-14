import { describe, expect, it } from "vitest";
import type { ScenarioDirectorResult } from "../ai/contracts";
import { createVoiceCastingService } from "./service";
import type { VoiceProviderCapabilities, VoiceRenderProvider } from "./types";

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  return {
    scenario_id: "voice-cast-service",
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

function getCapabilities(provider: VoiceRenderProvider): VoiceProviderCapabilities {
  return {
    provider,
    supportsStreaming: true,
    supportsEmotionControl: provider !== "browser-native-speech",
    supportsSpeedControl: true,
    supportsStyleControl: provider !== "browser-native-speech",
    supportsCustomVoices: provider === "cartesia" || provider === "elevenlabs",
    supportsRealtimeNativeOutput: provider === "openai-realtime-native" || provider === "browser-native-speech",
    supportsWordTimestamps: provider === "cartesia" || provider === "elevenlabs",
    defaultModel: `${provider}-model`,
    supportedModels: [`${provider}-model`],
    outputFormats: [{ container: "mp3", encoding: "mp3", mimeType: "audio/mpeg" }],
  };
}

describe("voice casting service", () => {
  it("varies voices across nearby sessions instead of reusing one default constantly", () => {
    const service = createVoiceCastingService();
    const scenario = createScenario();
    const providers: VoiceRenderProvider[] = ["cartesia", "openai-native-speech", "browser-native-speech"];

    const casts = [
      service.assignSessionIdentity({
        scenario,
        sessionSeed: "session-1",
        availableProviders: providers,
        getProviderCapabilities: getCapabilities,
        baseSettings: {
          ageFlavor: "adult",
          warmth: "neutral",
          sharpness: "balanced",
          energy: "medium",
          pace: "steady",
          interruptionTendency: "situational",
          hesitationTendency: "light",
          verbosityTendency: "balanced",
          emotionalResponsiveness: "flexible",
        },
      }),
      service.assignSessionIdentity({
        scenario,
        sessionSeed: "session-2",
        availableProviders: providers,
        getProviderCapabilities: getCapabilities,
        baseSettings: {
          ageFlavor: "adult",
          warmth: "neutral",
          sharpness: "balanced",
          energy: "medium",
          pace: "steady",
          interruptionTendency: "situational",
          hesitationTendency: "light",
          verbosityTendency: "balanced",
          emotionalResponsiveness: "flexible",
        },
      }),
      service.assignSessionIdentity({
        scenario,
        sessionSeed: "session-3",
        availableProviders: providers,
        getProviderCapabilities: getCapabilities,
        baseSettings: {
          ageFlavor: "adult",
          warmth: "neutral",
          sharpness: "balanced",
          energy: "medium",
          pace: "steady",
          interruptionTendency: "situational",
          hesitationTendency: "light",
          verbosityTendency: "balanced",
          emotionalResponsiveness: "flexible",
        },
      }),
    ];

    expect(new Set(casts.map((cast) => `${cast.provider}:${cast.voiceId}`)).size).toBeGreaterThan(1);
    expect(new Set(casts.map((cast) => cast.openerCadencePattern)).size).toBeGreaterThan(1);
  });

  it("keeps the same voice for an intentional repeat caller", () => {
    const service = createVoiceCastingService();
    const scenario = createScenario({
      repeat_caller_key: "member-erin-calloway",
      preserve_caller_voice: true,
    } as Partial<ScenarioDirectorResult>);

    const first = service.assignSessionIdentity({
      scenario,
      sessionSeed: "repeat-1",
      availableProviders: ["cartesia", "openai-native-speech"],
      getProviderCapabilities: getCapabilities,
      baseSettings: {
        ageFlavor: "adult",
        warmth: "neutral",
        sharpness: "balanced",
        energy: "medium",
        pace: "steady",
        interruptionTendency: "situational",
        hesitationTendency: "light",
        verbosityTendency: "balanced",
        emotionalResponsiveness: "flexible",
      },
    });

    const second = service.assignSessionIdentity({
      scenario,
      sessionSeed: "repeat-2",
      availableProviders: ["cartesia", "openai-native-speech"],
      getProviderCapabilities: getCapabilities,
      baseSettings: {
        ageFlavor: "adult",
        warmth: "neutral",
        sharpness: "balanced",
        energy: "medium",
        pace: "steady",
        interruptionTendency: "situational",
        hesitationTendency: "light",
        verbosityTendency: "balanced",
        emotionalResponsiveness: "flexible",
      },
    });

    expect(second.provider).toBe(first.provider);
    expect(second.voiceId).toBe(first.voiceId);
    expect(second.cadenceFingerprint).toBe(first.cadenceFingerprint);
    expect(second.repeatCallerKey).toBe("member-erin-calloway");
    expect(second.preserveCallerVoice).toBe(true);
  });

  it("applies anti-repetition guardrails to nearby sessions on the same provider", () => {
    const service = createVoiceCastingService();
    const scenario = createScenario();

    const first = service.assignSessionIdentity({
      scenario,
      sessionSeed: "nearby-a",
      preferredProvider: "cartesia",
      availableProviders: ["cartesia"],
      getProviderCapabilities: getCapabilities,
      baseSettings: {
        ageFlavor: "adult",
        warmth: "neutral",
        sharpness: "balanced",
        energy: "medium",
        pace: "steady",
        interruptionTendency: "situational",
        hesitationTendency: "light",
        verbosityTendency: "balanced",
        emotionalResponsiveness: "flexible",
      },
    });
    const second = service.assignSessionIdentity({
      scenario,
      sessionSeed: "nearby-b",
      preferredProvider: "cartesia",
      availableProviders: ["cartesia"],
      getProviderCapabilities: getCapabilities,
      baseSettings: {
        ageFlavor: "adult",
        warmth: "neutral",
        sharpness: "balanced",
        energy: "medium",
        pace: "steady",
        interruptionTendency: "situational",
        hesitationTendency: "light",
        verbosityTendency: "balanced",
        emotionalResponsiveness: "flexible",
      },
    });

    expect(`${second.voiceId}:${second.cadenceFingerprint}:${second.openerCadencePattern}`).not.toBe(
      `${first.voiceId}:${first.cadenceFingerprint}:${first.openerCadencePattern}`,
    );
    expect(second.castingDiagnostics.recentProviderUsageFrequency).toBeGreaterThanOrEqual(1);
  });

  it("lets persona shape delivery settings", () => {
    const service = createVoiceCastingService();

    const blunt = service.assignSessionIdentity({
      scenario: createScenario({
        customer_persona: {
          name: "Chris",
          age_band: "40-50",
          membership_context: "Long-time member",
          communication_style: "blunt and impatient",
          initial_emotion: "angry",
          patience_level: "low",
        },
      }),
      sessionSeed: "persona-blunt",
      availableProviders: ["openai-native-speech"],
      getProviderCapabilities: getCapabilities,
      baseSettings: {
        ageFlavor: "adult",
        warmth: "neutral",
        sharpness: "balanced",
        energy: "medium",
        pace: "steady",
        interruptionTendency: "situational",
        hesitationTendency: "light",
        verbosityTendency: "balanced",
        emotionalResponsiveness: "flexible",
      },
    });

    const warmConfused = service.assignSessionIdentity({
      scenario: createScenario({
        customer_persona: {
          name: "Dana",
          age_band: "30-40",
          membership_context: "New member",
          communication_style: "warm and unsure",
          initial_emotion: "confused",
          patience_level: "moderate",
        },
      }),
      sessionSeed: "persona-warm-confused",
      availableProviders: ["openai-native-speech"],
      getProviderCapabilities: getCapabilities,
      baseSettings: {
        ageFlavor: "adult",
        warmth: "neutral",
        sharpness: "balanced",
        energy: "medium",
        pace: "steady",
        interruptionTendency: "situational",
        hesitationTendency: "light",
        verbosityTendency: "balanced",
        emotionalResponsiveness: "flexible",
      },
    });

    expect(blunt.personaArchetype).toBe("blunt_low_patience");
    expect(blunt.adjustedSettings.pace).toBe("brisk");
    expect(blunt.adjustedSettings.sharpness).toBe("edgy");
    expect(warmConfused.personaArchetype).toBe("warm_confused");
    expect(warmConfused.adjustedSettings.warmth).toBe("warm");
    expect(warmConfused.adjustedSettings.hesitationTendency).toBe("noticeable");
  });
});
