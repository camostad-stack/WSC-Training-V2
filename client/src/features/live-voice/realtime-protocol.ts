export function buildRealtimeResponseCreateEvent(params: {
  outputModalities: Array<"audio" | "text">;
  instructions?: string;
}) {
  return {
    type: "response.create" as const,
    response: {
      output_modalities: params.outputModalities,
      instructions: params.instructions,
    },
  };
}

export function isRealtimeResponseCompletionEvent(type: string) {
  return type === "response.done";
}

export function claimRealtimeResponseCompletion(processedIds: Set<string>, responseId: string) {
  if (processedIds.has(responseId)) {
    return false;
  }
  processedIds.add(responseId);
  return true;
}

export function claimRealtimeTranscriptItem(processedIds: Set<string>, itemId?: string | null) {
  if (!itemId) return true;
  if (processedIds.has(itemId)) {
    return false;
  }
  processedIds.add(itemId);
  return true;
}

function extractTextFromUnknown(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const combined = value.map(extractTextFromUnknown).filter(Boolean).join(" ").trim();
    return combined || null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return extractTextFromUnknown(
      record.message
        ?? record.error
        ?? record.transcript
        ?? record.text
        ?? record.content
        ?? record.audio_transcript
        ?? record.delta,
    );
  }
  return null;
}

export function extractRealtimeErrorMessage(event: Record<string, unknown>): string | null {
  const error = event.error;
  if (!error) return null;
  if (typeof error === "string") return error.trim() || null;
  if (typeof error !== "object") return extractTextFromUnknown(error);

  const record = error as Record<string, unknown>;
  const message = extractTextFromUnknown(record.message) ?? extractTextFromUnknown(record.error);
  const code = extractTextFromUnknown(record.code);
  const type = extractTextFromUnknown(record.type);
  const parts = [message, code, type].filter((value, index, values) => (
    typeof value === "string" && value.trim().length > 0 && values.indexOf(value) === index
  ));

  return parts.length > 0 ? parts.join(" · ") : null;
}
