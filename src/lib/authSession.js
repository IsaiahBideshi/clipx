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

    resolveAuthSession().then((nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = auth.onAuthStateChange((event, nextSession) => {
      if (cancelled || event === "INITIAL_SESSION") {
        return;
      }

      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
