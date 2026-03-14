import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { createLiveVoiceSessionCredentials } from "./services/live-voice";

const scenario = {
  scenario_id: "test-live-voice",
  department: "customer_service",
  employee_role: "Front Desk Associate",
  difficulty: 3,
  scenario_family: "billing_confusion",
  customer_persona: {
    name: "Jordan Member",
    age_band: "30-40",
    membership_context: "Long-time premium member",
    communication_style: "Direct",
    initial_emotion: "frustrated",
    patience_level: "moderate",
  },
  situation_summary: "Customer is frustrated about a recent billing issue.",
  opening_line: "I need someone to explain this charge right now.",
  hidden_facts: ["The duplicate charge was caused by a migration issue."],
  approved_resolution_paths: ["Verify the charge and explain the refund path."],
  required_behaviors: ["Acknowledge frustration", "Take ownership"],
  critical_errors: ["Promise a refund amount without verification"],
  branch_logic: {
    if_empathy_is_strong: "Customer calms slightly.",
    if_answer_is_vague: "Customer gets more frustrated.",
    if_policy_is_wrong: "Customer asks for a manager.",
    if_employee_takes_ownership: "Customer becomes more cooperative.",
    if_employee_fails_to_help: "Customer threatens to cancel.",
    if_employee_escalates_correctly: "Customer accepts the handoff.",
  },
  emotion_progression: {
    starting_state: "frustrated",
    better_if: ["Empathy"],
    worse_if: ["Deflection"],
  },
  completion_rules: {
    resolved_if: ["Charge is explained and next step is clear"],
    end_early_if: ["Employee hangs up"],
    manager_required_if: ["Customer demands a supervisor"],
  },
  recommended_turns: 4,
} as const;

describe("createLiveVoiceSessionCredentials", () => {
  const originalForgeApiUrl = ENV.forgeApiUrl;
  const originalForgeApiKey = ENV.forgeApiKey;
  const originalRealtimeModel = ENV.realtimeModel;
  const originalRealtimeVoice = ENV.realtimeVoice;
  const originalCartesiaApiKey = ENV.cartesiaApiKey;
  const originalVoiceRenderMode = ENV.voiceRenderMode;
  const originalVoiceRenderPrimaryProvider = ENV.voiceRenderPrimaryProvider;
  const originalVoiceRenderFallbackProviders = ENV.voiceRenderFallbackProviders;
  const originalVoiceRenderQaBaselineProvider = ENV.voiceRenderQaBaselineProvider;
  const originalVoiceRenderAllowBrowserNativeFallback = ENV.voiceRenderAllowBrowserNativeFallback;
  const originalLiveVoiceAllowLocalBrowserFallback = ENV.liveVoiceAllowLocalBrowserFallback;

  beforeEach(() => {
    vi.restoreAllMocks();
    ENV.realtimeModel = "gpt-realtime";
    ENV.realtimeVoice = "alloy";
    ENV.voiceRenderMode = "external-provider";
    ENV.voiceRenderPrimaryProvider = "cartesia";
    ENV.voiceRenderFallbackProviders = "openai-native-speech,browser-native-speech";
    ENV.voiceRenderQaBaselineProvider = "openai-native-speech";
    ENV.voiceRenderAllowBrowserNativeFallback = false;
    ENV.liveVoiceAllowLocalBrowserFallback = false;
  });

  afterEach(() => {
    ENV.forgeApiUrl = originalForgeApiUrl;
    ENV.forgeApiKey = originalForgeApiKey;
    ENV.realtimeModel = originalRealtimeModel;
    ENV.realtimeVoice = originalRealtimeVoice;
    ENV.cartesiaApiKey = originalCartesiaApiKey;
    ENV.voiceRenderMode = originalVoiceRenderMode;
    ENV.voiceRenderPrimaryProvider = originalVoiceRenderPrimaryProvider;
    ENV.voiceRenderFallbackProviders = originalVoiceRenderFallbackProviders;
    ENV.voiceRenderQaBaselineProvider = originalVoiceRenderQaBaselineProvider;
    ENV.voiceRenderAllowBrowserNativeFallback = originalVoiceRenderAllowBrowserNativeFallback;
    ENV.liveVoiceAllowLocalBrowserFallback = originalLiveVoiceAllowLocalBrowserFallback;
  });

  it("keeps the session in the provider-backed stack even when realtime transport is unavailable", async () => {
    ENV.forgeApiUrl = "";
    ENV.forgeApiKey = "";
    ENV.cartesiaApiKey = "cartesia-secret";

    const result = await createLiveVoiceSessionCredentials({
      scenario: scenario as any,
      employeeRole: "Front Desk Associate",
    });

    expect(result.enabled).toBe(false);
    expect(result.mode).toBe("live_voice");
    expect(result.transport).toBe("browser-native-speech");
    expect(result.audioOutputMode).toBe("external-rendered");
    expect(result.responseModalities).toEqual(["text"]);
    expect(result.turnControl).toBe("backend_validated_manual");
    expect(result.allowLocalBrowserFallback).toBe(false);
    expect(result.allowBrowserNativeAudioFallback).toBe(false);
    expect(result.voiceCast.provider).toBe("cartesia");
    expect(result.reason).toContain("not configured");
  });

  it("uses Cartesia as the primary external renderer while keeping Realtime as the control plane", async () => {
    ENV.forgeApiUrl = "https://forge.example.com";
    ENV.forgeApiKey = "secret";
    ENV.cartesiaApiKey = "cartesia-secret";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sess_123",
        client_secret: {
          value: "ephemeral_123",
          expires_at: 1234567890,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await createLiveVoiceSessionCredentials({
      scenario: scenario as any,
      employeeRole: "Front Desk Associate",
      sessionSeed: "live-seed-123",
    });

    expect(result.enabled).toBe(true);
    expect(result.clientSecret).toBe("ephemeral_123");
    expect(result.connectionUrl).toContain("/v1/realtime");
    expect(result.transport).toBe("openai-realtime-webrtc");
    expect(result.audioOutputMode).toBe("external-rendered");
    expect(result.responseModalities).toEqual(["text"]);
    expect(result.turnControl).toBe("backend_validated_manual");
    expect(result.allowLocalBrowserFallback).toBe(false);
    expect(result.allowBrowserNativeAudioFallback).toBe(false);
    expect(result.voiceCast.provider).toBe("cartesia");
    expect(result.qaCompareProviders).toContain("cartesia");
    expect(result.qaCompareProviders).toContain("openai-native-speech");
    expect(result.openingResponseInstructions).toContain("Start the call now");
    expect(result.instructions).toContain("Wait for each employee turn");
    expect(result.instructions).toContain("Do not assume the call is over because the employee sounds calm");
    const fetchPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(fetchPayload.session.audio.input.turn_detection.create_response).toBe(false);
    expect(fetchPayload.session.audio.output.voice).toBe("alloy");
  });

  it("falls back to OpenAI native speech when Cartesia is unavailable", async () => {
    ENV.forgeApiUrl = "https://forge.example.com";
    ENV.forgeApiKey = "secret";
    ENV.cartesiaApiKey = "";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sess_123",
        client_secret: {
          value: "ephemeral_123",
          expires_at: 1234567890,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await createLiveVoiceSessionCredentials({
      scenario: scenario as any,
      employeeRole: "Front Desk Associate",
      sessionSeed: "live-seed-openai-fallback",
    });

    expect(result.enabled).toBe(true);
    expect(result.transport).toBe("openai-realtime-webrtc");
    expect(result.audioOutputMode).toBe("external-rendered");
    expect(result.responseModalities).toEqual(["text"]);
    expect(result.voiceCast.provider).toBe("openai-native-speech");
    expect(result.voiceCast.fallbackProviders).not.toContain("browser-native-speech");
  });
});
