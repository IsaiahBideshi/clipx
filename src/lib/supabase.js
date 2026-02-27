import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://vymaqpjhajwpbzmnoadk.supabase.co",
  "sb_publishable_2wc5OZpO54DVJ7HUGwkWXQ_UP9zVSgv"
);

const auth = supabase.auth;

function throwIfAuthError(error) {
    if (error) {
        throw error;
    }
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
    return data.session;
}

export {  loginWithEmail, logout, auth, getSession };