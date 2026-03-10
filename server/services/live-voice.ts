import { ENV } from "../_core/env";
import type { ScenarioDirectorResult } from "./ai/contracts";

export interface LiveVoiceCredentialRequest {
  scenario: ScenarioDirectorResult;
  employeeRole: string;
}

export interface LiveVoiceSessionCredentials {
  enabled: boolean;
  provider: "openai-realtime-webrtc";
  mode: "live_voice";
  model: string;
  voice: string;
  connectionUrl: string;
  clientSecret?: string;
  expiresAt?: number | null;
  sessionId?: string | null;
  instructions?: string;
  reason?: string;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildRealtimeBaseUrl() {
  return ensureTrailingSlash(ENV.forgeApiUrl);
}

function buildLiveVoiceInstructions(scenario: ScenarioDirectorResult, employeeRole: string) {
  return [
    "You are the live voice customer for a Woodinville Sports Club training scenario.",
    "Stay fully in character and speak like a natural customer on a phone call.",
    "Do not coach the employee and do not reveal hidden facts unless they are earned.",
    `Employee role: ${employeeRole}.`,
    `Scenario family: ${scenario.scenario_family}.`,
    `Customer name: ${scenario.customer_persona.name}.`,
    `Customer communication style: ${scenario.customer_persona.communication_style}.`,
    `Initial emotion: ${scenario.customer_persona.initial_emotion}.`,
    `Situation summary: ${scenario.situation_summary}`,
    `Opening line: ${scenario.opening_line}`,
    `Approved resolution paths: ${(scenario.approved_resolution_paths || []).join("; ") || "None supplied."}`,
    `Required behaviors to reward: ${(scenario.required_behaviors || []).join("; ") || "None supplied."}`,
    `Critical errors to react strongly to: ${(scenario.critical_errors || []).join("; ") || "None supplied."}`,
    `Hidden facts: ${(scenario.hidden_facts || []).join("; ") || "None supplied."}`,
    "Begin the call by delivering the opening line naturally. Then continue the conversation as the customer.",
    "Keep the session trainable in roughly 3 to 5 turns unless the employee mishandles the interaction or escalation is required.",
    "When the matter is clearly resolved or correctly escalated, wrap up naturally and stop pushing the issue.",
  ].join("\n");
}

function buildConnectionUrl(model: string) {
  if (!ENV.forgeApiUrl) {
    return `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
  }
  const url = new URL("v1/realtime", buildRealtimeBaseUrl());
  url.searchParams.set("model", model);
  return url.toString();
}

export async function createLiveVoiceSessionCredentials(
  input: LiveVoiceCredentialRequest,
): Promise<LiveVoiceSessionCredentials> {
  const model = ENV.realtimeModel;
  const voice = ENV.realtimeVoice;
  const instructions = buildLiveVoiceInstructions(input.scenario, input.employeeRole);

  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    return {
      enabled: false,
      provider: "openai-realtime-webrtc",
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      instructions,
      reason: "Realtime session credentials are not configured on the server.",
    };
  }

  const payload = {
    session: {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
          },
          transcription: {
            model: "gpt-4o-mini-transcribe",
          },
        },
        output: {
          voice,
        },
      },
    },
    expires_after: {
      anchor: "created_at",
      seconds: 120,
    },
  };

  try {
    const response = await fetch(new URL("v1/realtime/client_secrets", buildRealtimeBaseUrl()), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      return {
        enabled: false,
        provider: "openai-realtime-webrtc",
        mode: "live_voice",
        model,
        voice,
        connectionUrl: buildConnectionUrl(model),
        instructions,
        reason: `Realtime credential request failed (${response.status} ${response.statusText}): ${message}`,
      };
    }

    const json = await response.json() as {
      id?: string;
      expires_at?: number;
      value?: string;
      client_secret?: { value?: string; expires_at?: number | null };
    };

    const clientSecret = json.client_secret?.value ?? json.value;
    const expiresAt = json.client_secret?.expires_at ?? json.expires_at ?? null;

    if (!clientSecret) {
      return {
        enabled: false,
        provider: "openai-realtime-webrtc",
        mode: "live_voice",
        model,
        voice,
        connectionUrl: buildConnectionUrl(model),
        instructions,
        reason: "Realtime credential response did not include a client secret.",
      };
    }

    return {
      enabled: true,
      provider: "openai-realtime-webrtc",
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      clientSecret,
      expiresAt,
      sessionId: json.id ?? null,
      instructions,
    };
  } catch (error) {
    return {
      enabled: false,
      provider: "openai-realtime-webrtc",
      mode: "live_voice",
      model,
      voice,
      connectionUrl: buildConnectionUrl(model),
      instructions,
      reason: error instanceof Error ? error.message : "Realtime credential request failed.",
    };
  }
}
