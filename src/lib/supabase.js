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

export async function updateDisplayName(newDisplayName) {
    const id = (await auth.getUser()).data.user.id;
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
    return data.session;
}

export {  loginWithEmail, logout, auth, getSession };