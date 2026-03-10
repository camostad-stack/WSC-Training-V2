import type { AiServiceDefinition, AiServiceName } from "./registry";
import { invokeLLM } from "../../_core/llm";
import { logPromptFailure, logPromptStart, logPromptSuccess } from "./logging";
import { PromptExecutionError } from "./errors";

function parseJsonFromLLM(content: string): unknown {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

export async function runPrompt<T>(
  definition: AiServiceDefinition<T>,
  userMessage: string,
  overrides?: {
    systemPrompt?: string;
    responseFormat?: unknown;
    validator?: { parse: (value: unknown) => T };
    promptName?: AiServiceName | string;
  },
): Promise<T> {
  if (definition.kind !== "llm") {
    throw new Error(`Service ${definition.name} is not an LLM prompt`);
  }

  const promptName = overrides?.promptName ?? definition.name;
  const version = definition.version;
  const startedAt = Date.now();
  logPromptStart(String(promptName), version);

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: overrides?.systemPrompt ?? definition.systemPrompt ?? "" },
        { role: "user", content: userMessage },
      ],
      ...(overrides?.responseFormat ?? definition.responseFormat
        ? { response_format: (overrides?.responseFormat ?? definition.responseFormat) as any }
        : {}),
    });

    const content = result.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new PromptExecutionError({
        code: "llm_failure",
        promptName: String(promptName),
        promptVersion: version,
        latencyMs: Date.now() - startedAt,
        message: `[${promptName}] LLM returned empty response`,
      });
    }

    let parsed: unknown;
    try {
      parsed = parseJsonFromLLM(content);
    } catch (error) {
      throw new PromptExecutionError({
        code: "malformed_json",
        promptName: String(promptName),
        promptVersion: version,
        latencyMs: Date.now() - startedAt,
        message: `[${promptName}] LLM returned malformed JSON`,
        cause: error,
      });
    }

    try {
      const validator = overrides?.validator ?? definition.validator;
      const validated = validator ? validator.parse(parsed) : (parsed as T);
      logPromptSuccess(String(promptName), version, Date.now() - startedAt);
      return validated;
    } catch (error) {
      throw new PromptExecutionError({
        code: "invalid_output",
        promptName: String(promptName),
        promptVersion: version,
        latencyMs: Date.now() - startedAt,
        message: `[${promptName}] LLM returned invalid structured output`,
        cause: error,
      });
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    logPromptFailure(String(promptName), version, latencyMs, error);
    if (error instanceof PromptExecutionError) {
      throw error;
    }
    throw new PromptExecutionError({
      code: "llm_failure",
      promptName: String(promptName),
      promptVersion: version,
      latencyMs,
      message: `[${promptName}] LLM invocation failed`,
      cause: error,
    });
  }
}
