import { describe, expect, it } from "vitest";

import {
  buildRealtimeResponseCreateEvent,
  claimRealtimeTranscriptItem,
  claimRealtimeResponseCompletion,
  extractRealtimeErrorMessage,
  isRealtimeResponseCompletionEvent,
} from "./realtime-protocol";

describe("realtime-protocol", () => {
  it("uses output_modalities for response.create events", () => {
    expect(buildRealtimeResponseCreateEvent({
      outputModalities: ["text"],
      instructions: "Reply now.",
    })).toEqual({
      type: "response.create",
      response: {
        output_modalities: ["text"],
        instructions: "Reply now.",
      },
    });
  });

  it("extracts a readable realtime error message from structured error events", () => {
    expect(extractRealtimeErrorMessage({
      error: {
        message: "Unknown parameter: response.modalities",
        code: "invalid_request_error",
        type: "error",
      },
    })).toBe("Unknown parameter: response.modalities · invalid_request_error · error");
  });

  it("dedupes repeated completion events for the same realtime response", () => {
    const processed = new Set<string>();

    expect(claimRealtimeResponseCompletion(processed, "resp_1")).toBe(true);
    expect(claimRealtimeResponseCompletion(processed, "resp_1")).toBe(false);
    expect(claimRealtimeResponseCompletion(processed, "resp_2")).toBe(true);
  });

  it("only treats response.done as the final completion event", () => {
    expect(isRealtimeResponseCompletionEvent("response.output_item.done")).toBe(false);
    expect(isRealtimeResponseCompletionEvent("response.done")).toBe(true);
  });

  it("dedupes repeated employee transcript completions for the same realtime item", () => {
    const processed = new Set<string>();

    expect(claimRealtimeTranscriptItem(processed, "item_1")).toBe(true);
    expect(claimRealtimeTranscriptItem(processed, "item_1")).toBe(false);
    expect(claimRealtimeTranscriptItem(processed, "item_2")).toBe(true);
    expect(claimRealtimeTranscriptItem(processed, undefined)).toBe(true);
  });
});
