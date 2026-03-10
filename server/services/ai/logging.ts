export function logPromptStart(promptName: string, version: string) {
  console.info("[AI Prompt] start", { promptName, version });
}

export function logPromptSuccess(promptName: string, version: string, latencyMs: number) {
  console.info("[AI Prompt] success", { promptName, version, latencyMs });
}

export function logPromptFailure(
  promptName: string,
  version: string,
  latencyMs: number,
  failure: unknown,
) {
  console.error("[AI Prompt] failure", {
    promptName,
    version,
    latencyMs,
    failure: failure instanceof Error ? failure.message : String(failure),
  });
}
