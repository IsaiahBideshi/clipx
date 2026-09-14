const DEFAULT_API_BASE = "https://clipx.bideshi.tech";

function getApiBase() {
  return (import.meta.env.VITE_DATABASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export async function listClips(session, query = {}) {
  const params = new URLSearchParams(query);
  const response = await fetch(`${getApiBase()}/api/clips?${params.toString()}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  return response.json().catch(() => ({ data: null, error: "Invalid server response." }));
}