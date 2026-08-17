const GITHUB_LATEST_URL = "https://api.github.com/repos/IsaiahBideshi/clipx/releases/latest";
const CACHE_TTL_MS = 60 * 1000;
const EDGE_CACHE_SECONDS = 20;

let cached = null;

async function fetchLatestVersion() {
  const response = await fetch(GITHUB_LATEST_URL, {
    headers: {
      "User-Agent": "clipx-update-check",
      "Accept": "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}`);
  }

  const release = await response.json();
  return {
    version: String(release.tag_name || "").replace(/^v/i, ""),
    tagName: release.tag_name,
    publishedAt: release.published_at,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Cache-Control", `public, s-maxage=${EDGE_CACHE_SECONDS}`)

  if (req.method !== "GET") {
    return res.status(405).json({ data: null, error: "Method not allowed", ok: false })
  }

  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return res.status(200).json({ data: cached, error: null, ok: true })
  }

  try {
    const latest = await fetchLatestVersion();
    cached = { ...latest, cachedAt: now };
    return res.status(200).json({ data: cached, error: null, ok: true })
  } catch (error) {
    if (cached) {
      return res.status(200).json({ data: cached, error: "Using cached version", ok: true })
    }
    return res.status(503).json({ data: null, error: "Could not fetch latest version", ok: false })
  }
}