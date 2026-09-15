import { useEffect, useState } from "react";
import { auth, getSession, startAuthAutoRefresh } from "./supabase.js";

function isMissingSessionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("session") && message.includes("missing");
}

export async function resolveAuthSession() {
  startAuthAutoRefresh();

  try {
    return await getSession();
  } catch (error) {
    if (!isMissingSessionError(error)) {
      console.warn("Failed to load auth session:", error);
    }
    return null;
  }
}

export async function getCurrentUserId() {
  const session = await resolveAuthSession();
  return session?.user?.id ?? null;
}

export function useAuthSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let initialSessionHandled = false;
    let resolved = false;
    let resolvedSession = null;
    let fallbackTimer;

    resolveAuthSession().then(
      (nextSession) => {
        resolved = true;
        resolvedSession = nextSession;
        if (cancelled || initialSessionHandled) {
          return;
        }
        // A null result here can precede the real session when async storage
        // hasn't finished loading yet. INITIAL_SESSION below is authoritative
        // for the signed-out case, so only a non-null session clears loading.
        if (nextSession) {
          setSession(nextSession);
          setLoading(false);
        }
      },
      () => {
        resolved = true;
        resolvedSession = null;
      }
    );

    const {
      data: { subscription },
    } = auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) {
        return;
      }
      if (event === "INITIAL_SESSION") {
        initialSessionHandled = true;
        clearTimeout(fallbackTimer);
      }

      setSession(nextSession);
      setLoading(false);
    });

    // Safety net: if INITIAL_SESSION is delayed or never fires, fall back to whatever getSession() returned
    fallbackTimer = setTimeout(() => {
      if (cancelled || initialSessionHandled) {
        return;
      }
      if (resolved) {
        initialSessionHandled = true;
        setSession(resolvedSession);
      }
      setLoading(false);
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
