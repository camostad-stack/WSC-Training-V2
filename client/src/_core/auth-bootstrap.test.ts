import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REQUEST_TIMEOUT_MS,
  SESSION_LOOKUP_TIMEOUT_MS,
  fetchWithTimeout,
  resolveSupabaseAccessToken,
  resolveSupabaseSession,
} from "./auth-bootstrap";

describe("auth bootstrap helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the session when Supabase responds in time", async () => {
    const session = { access_token: "token-123" };
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session } }),
      },
    } as any;

    await expect(resolveSupabaseSession(supabase)).resolves.toEqual(session);
    await expect(resolveSupabaseAccessToken(supabase)).resolves.toBe("token-123");
  });

  it("fails open when Supabase session lookup stalls", async () => {
    vi.useFakeTimers();

    const supabase = {
      auth: {
        getSession: vi.fn(() => new Promise(() => {})),
      },
    } as any;

    const pending = resolveSupabaseSession(supabase);
    await vi.advanceTimersByTimeAsync(SESSION_LOOKUP_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
  });

  it("aborts long-running API requests", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchWithTimeout("/api/trpc", {});
    const expectation = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    await expectation;
  });
});
