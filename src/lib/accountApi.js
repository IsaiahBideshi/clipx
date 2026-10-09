import { supabase } from "./supabase.js";

const DEFAULT_API_BASE = "https://clipx.bideshi.tech";

function getApiBase() {
  return (import.meta.env.VITE_DATABASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
}

async function readResponse(response) {
  const payload = await response.json().catch(() => ({ data: null, error: "Invalid server response." }));

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }

  return payload.data;
}

async function accountRequest(session, method = "GET", body) {
  if (!session?.access_token) {
    throw new Error("No authenticated session found.");
  }

  const response = await fetch(`${getApiBase()}/api/account`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return readResponse(response);
}

export function getAccount(session) {
  return accountRequest(session);
}

export function getAccountInitials(account) {
  const source = account?.username || account?.email || "User";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";
}

export async function loadAccountData(session, userId) {
  try {
    return await getAccount(session);
  } catch (err) {
    console.error("Error fetching account:", err);
    const fallbackAccount = {
      id: session.user.id,
      username: session.user.user_metadata?.displayName || session.user.user_metadata?.name || "User",
      email: session.user.email || "",
      emailConfirmed: Boolean(session.user.email_confirmed_at),
      avatarUrl: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || "",
      hasCustomAvatar: Boolean(session.user.user_metadata?.avatar_url),
      providers: session.user.app_metadata?.providers || [],
      hasPassword: session.user.app_metadata?.providers?.includes("email") || false,
    };

    const { data, error } = await supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();

    if (!error && data?.username) {
      fallbackAccount.username = data.username;
    }

    return fallbackAccount;
  }
}

export function updateAccountProfile(session, { username, avatarUrl }) {
  return accountRequest(session, "PATCH", {
    action: "profile",
    username,
    avatarUrl,
  });
}

export function updateAccountEmail(session, email) {
  return accountRequest(session, "PATCH", {
    action: "email",
    email,
  });
}

export function updateAccountPassword(session, { currentPassword, password }) {
  return accountRequest(session, "PATCH", {
    action: "password",
    currentPassword,
    password,
  });
}
