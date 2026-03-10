export type PromptFailureCode = "malformed_json" | "invalid_output" | "llm_failure";

export class PromptExecutionError extends Error {
  readonly code: PromptFailureCode;
  readonly promptName: string;
  readonly promptVersion: string;
  readonly latencyMs: number;

  constructor(params: {
    code: PromptFailureCode;
    promptName: string;
    promptVersion: string;
    latencyMs: number;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "PromptExecutionError";
    this.code = params.code;
    this.promptName = params.promptName;
    this.promptVersion = params.promptVersion;
    this.latencyMs = params.latencyMs;
    if (params.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = params.cause;
    }
  }
}

export type PipelineFailureCode =
  | "transcript_failure"
  | "malformed_json"
  | "incomplete_session"
  | "invalid_media"
  | "reprocess_required"
  | "llm_failure";

export interface PipelineFailure {
  code: PipelineFailureCode;
  stage: string;
  message: string;
  retryable: boolean;
  promptName?: string;
  promptVersion?: string;
}
