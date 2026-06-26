import { createClient } from "@supabase/supabase-js";
import { getAuthMessage } from "../pages/signup";

const authStorage = {
    async getItem(key) {
        if (window?.clipx?.authStorageGet) {
            const storedValue = await window.clipx.authStorageGet(key);
            if (storedValue !== null) {
                return storedValue;
            }

            const localValue = globalThis.localStorage?.getItem(key) ?? null;
            if (localValue !== null) {
                await window.clipx.authStorageSet(key, localValue);
            }
            return localValue;
        }

        return globalThis.localStorage?.getItem(key) ?? null;
    },
    async setItem(key, value) {
        if (window?.clipx?.authStorageSet) {
            await window.clipx.authStorageSet(key, value);
            return;
        }

        globalThis.localStorage?.setItem(key, value);
    },
    async removeItem(key) {
        if (window?.clipx?.authStorageRemove) {
            await window.clipx.authStorageRemove(key);
            return;
        }

        globalThis.localStorage?.removeItem(key);
    },
};

export const supabase = createClient(
  "https://vymaqpjhajwpbzmnoadk.supabase.co",
  "sb_publishable_2wc5OZpO54DVJ7HUGwkWXQ_UP9zVSgv",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: authStorage,
    },
  }
);

const auth = supabase.auth;
let autoRefreshStarted = false;

console.log("Supabase client initialized:", auth);

function startAuthAutoRefresh() {
    if (autoRefreshStarted || typeof auth.startAutoRefresh !== "function") {
        return;
    }

    autoRefreshStarted = true;
    void auth.startAutoRefresh().catch((error) => {
        autoRefreshStarted = false;
        console.warn("Failed to start Supabase auth auto-refresh:", error);
    });
}

startAuthAutoRefresh();

async function signInWithGoogle() {
  let error = "";
  try {
    if (window?.clipx?.signInWithGoogle) {
      const result = await window.clipx.signInWithGoogle();
      if (result?.ok && result.session?.access_token && result.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
        });
        throwIfAuthError(sessionError);
      } else {
        error = "Google Sign-In failed.";
      }
    } else {
        error = "Google Sign-In is not supported in this environment.";
    }
  } catch (err) {
      error = getAuthMessage(err);
  }
  return { ok: !error, error };
}

function throwIfAuthError(error) {
    if (error) {
        throw error;
    }
}

function isMissingSessionError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("session") && message.includes("missing");
}

export async function updateDisplayName(newDisplayName) {
    const session = await getSession();
    const id = session?.user?.id;
    if (!id) {
        throw new Error("No authenticated user found");
    }
    console.log(id);

    const { data, error } = await supabase
        .from('users')
        .update({ username: newDisplayName })
        .eq('id', id);
    
    if (error) {
        console.error("Error updating display name:", error);
        throw error;
    }
    console.log("Display name updated successfully:", data, newDisplayName);
    return data;
}

export async function signUpWithEmail(displayName, email, password) {
    const normalizedEmail = String(email || "").trim();
    const normalizedDisplayName = String(displayName || "").trim();

    const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
            data: {
                displayName: normalizedDisplayName,
            },
        },
    });

    throwIfAuthError(error);


    return data;
}   


async function loginWithEmail(email, password) {
    const normalizedEmail = String(email || "").trim();
    const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });

    throwIfAuthError(error);
    return data;
}

async function logout() {
    const { error } = await supabase.auth.signOut();
    throwIfAuthError(error);
}

async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    throwIfAuthError(error);

    if (data.session) {
        return data.session;
    }

    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
        if (isMissingSessionError(refreshError)) {
            return null;
        }
        throw refreshError;
    }

    return refreshedData?.session ?? null;
}

export {  loginWithEmail, logout, auth, getSession, signInWithGoogle, startAuthAutoRefresh };
