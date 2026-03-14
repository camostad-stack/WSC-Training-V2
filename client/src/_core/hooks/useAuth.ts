import { getLoginUrl } from "@/const";
import { resolveSupabaseSession } from "@/_core/auth-bootstrap";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const resolvedRedirectPath = redirectPath ?? getLoginUrl();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [bootstrapStalled, setBootstrapStalled] = useState(false);

  useEffect(() => {
    let mounted = true;
    const failOpenTimer = window.setTimeout(() => {
      if (!mounted) return;
      setHasSession(false);
      setSessionReady(true);
    }, 4000);

    void resolveSupabaseSession(supabase)
      .then((session) => {
        if (!mounted) return;
        setHasSession(Boolean(session));
        setSessionReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setHasSession(false);
        setSessionReady(true);
      })
      .finally(() => {
        window.clearTimeout(failOpenTimer);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      setSessionReady(true);
      void utils.auth.me.invalidate();
    });

    return () => {
      mounted = false;
      window.clearTimeout(failOpenTimer);
      subscription.unsubscribe();
    };
  }, [utils.auth.me]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: sessionReady && hasSession,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!sessionReady || !hasSession || !meQuery.isLoading) {
      setBootstrapStalled(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setBootstrapStalled(true);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [hasSession, meQuery.isLoading, sessionReady]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const authState = meQuery.data;
  const effectiveUser = authState?.user ?? null;
  const actorUser = authState?.actorUser ?? null;
  const impersonation = authState?.impersonation ?? null;

  const state = useMemo(() => {
    localStorage.setItem("manus-runtime-user-info", JSON.stringify(effectiveUser ?? null));
    return {
      user: hasSession ? effectiveUser : null,
      actorUser: hasSession ? actorUser : null,
      impersonation: hasSession ? impersonation : null,
      loading: !sessionReady || (hasSession && meQuery.isLoading && !bootstrapStalled) || logoutMutation.isPending,
      error: meQuery.error
        ?? logoutMutation.error
        ?? (bootstrapStalled ? new Error("Authentication bootstrap timed out. The app did not get a usable session response.") : null),
      isAuthenticated: hasSession && Boolean(effectiveUser),
    };
  }, [
    actorUser,
    bootstrapStalled,
    effectiveUser,
    hasSession,
    meQuery.error,
    meQuery.isLoading,
    impersonation,
    logoutMutation.error,
    logoutMutation.isPending,
    sessionReady,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (!sessionReady || meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (!resolvedRedirectPath) return;
    if (window.location.pathname === resolvedRedirectPath) return;

    window.location.href = resolvedRedirectPath;
  }, [
    redirectOnUnauthenticated,
    resolvedRedirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    sessionReady,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
