const DEFAULT_API_BASE = "https://clipx.bideshi.tech";
const MAX_TAGS = 20;
const MAX_LABEL_LENGTH = 50;

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

export function getClipTagsError(tags) {
  if (tags.length > MAX_TAGS) {
    return `A clip can have at most ${MAX_TAGS} tags`;
  }
  if (tags.some((tag) => typeof tag === "string" && tag.trim().length > MAX_LABEL_LENGTH)) {
    return `Tags must be ${MAX_LABEL_LENGTH} characters or fewer`;
  }
  return null;
}