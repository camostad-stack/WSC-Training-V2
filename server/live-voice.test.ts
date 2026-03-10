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

  beforeEach(() => {
    vi.restoreAllMocks();
    ENV.realtimeModel = "gpt-realtime";
    ENV.realtimeVoice = "alloy";
  });

  afterEach(() => {
    ENV.forgeApiUrl = originalForgeApiUrl;
    ENV.forgeApiKey = originalForgeApiKey;
    ENV.realtimeModel = originalRealtimeModel;
    ENV.realtimeVoice = originalRealtimeVoice;
  });

  it("returns a disabled response when realtime configuration is missing", async () => {
    ENV.forgeApiUrl = "";
    ENV.forgeApiKey = "";

    const result = await createLiveVoiceSessionCredentials({
      scenario: scenario as any,
      employeeRole: "Front Desk Associate",
    });

    expect(result.enabled).toBe(false);
    expect(result.mode).toBe("live_voice");
    expect(result.reason).toContain("not configured");
  });

  it("returns ephemeral credentials when the realtime backend succeeds", async () => {
    ENV.forgeApiUrl = "https://forge.example.com";
    ENV.forgeApiKey = "secret";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sess_123",
        client_secret: {
          value: "ephemeral_123",
          expires_at: 1234567890,
        },
      }),
    }));

    const result = await createLiveVoiceSessionCredentials({
      scenario: scenario as any,
      employeeRole: "Front Desk Associate",
    });

    expect(result.enabled).toBe(true);
    expect(result.clientSecret).toBe("ephemeral_123");
    expect(result.connectionUrl).toContain("/v1/realtime");
    expect(result.instructions).toContain("Opening line");
  });
});
