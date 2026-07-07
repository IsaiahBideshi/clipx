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
