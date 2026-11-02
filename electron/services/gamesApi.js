import { getSupabaseAccessToken } from "../ipc/authStorage.js";

const API_BASE = (process.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");

export async function fetchGames(params) {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/games?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { data, error } = await response.json().catch(() => ({ data: null, error: "Invalid server response." }));
  if (!response.ok || error) {
    console.error("ClipX: Failed to fetch games:", error || response.status);
    return null;
  }
  return data;
}
