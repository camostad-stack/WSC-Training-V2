import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";

describe("invokeLLM", () => {
  const originalForgeApiUrl = ENV.forgeApiUrl;
  const originalForgeApiKey = ENV.forgeApiKey;
  const originalOpenAiApiKey = ENV.openaiApiKey;
  const originalLlmModel = ENV.llmModel;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    ENV.forgeApiUrl = originalForgeApiUrl;
    ENV.forgeApiKey = originalForgeApiKey;
    ENV.openaiApiKey = originalOpenAiApiKey;
    ENV.llmModel = originalLlmModel;
  });

  it("uses an OpenAI-compatible model and payload when pointed at api.openai.com", async () => {
    ENV.forgeApiUrl = "https://api.openai.com";
    ENV.forgeApiKey = "forge-key";
    ENV.openaiApiKey = "openai-key";
    ENV.llmModel = "";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "chatcmpl_123",
        created: 1,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "{\"ok\":true}",
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({
      messages: [
        { role: "system", content: "Return JSON." },
        { role: "user", content: "Say hi." },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Record<string, string>).authorization).toBe("Bearer openai-key");
    const payload = JSON.parse(String(options.body));
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.thinking).toBeUndefined();
  });
});
