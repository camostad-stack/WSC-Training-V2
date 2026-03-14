import type { Session, SupabaseClient } from "@supabase/supabase-js";

type SessionReader = Pick<SupabaseClient, "auth">;

export const SESSION_LOOKUP_TIMEOUT_MS = 2500;
export const REQUEST_TIMEOUT_MS = 8000;

function createTimeoutError(message: string) {
  return new Error(message);
}

export async function resolveSupabaseSession(
  supabase: SessionReader,
  timeoutMs: number = SESSION_LOOKUP_TIMEOUT_MS,
): Promise<Session | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        globalThis.setTimeout(() => reject(createTimeoutError("supabase_session_timeout")), timeoutMs);
      }),
    ]);

    return result.data.session ?? null;
  } catch {
    return null;
  }
}

export async function resolveSupabaseAccessToken(
  supabase: SessionReader,
  timeoutMs: number = SESSION_LOOKUP_TIMEOUT_MS,
): Promise<string | null> {
  const session = await resolveSupabaseSession(supabase, timeoutMs);
  return session?.access_token ?? null;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await globalThis.fetch(input, {
      ...(init ?? {}),
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
