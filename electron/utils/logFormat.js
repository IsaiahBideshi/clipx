import { format } from "util";

const REDACTED = "[redacted]";
const SECRET_PATTERNS = [
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/\bya29\.[\w.-]+/g, REDACTED],
  [/\b(Bearer\s+)[^\s"',]+/gi, `$1${REDACTED}`],
  [/([?&](?:sig|code|code_verifier|token|access_token|refresh_token)=)[^&\s"']+/gi, `$1${REDACTED}`],
  [/\b((?:access|refresh|provider|provider_refresh|id)_token|client_secret|code_verifier|password)(["']?\s*[:=]\s*["']?)[^"'\s,}&]+/gi, `$1$2${REDACTED}`],
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactLogText(text, homeDir) {
  let result = String(text);
  if (homeDir) {
    const forms = [homeDir.replaceAll("\\", "\\\\"), homeDir, homeDir.replaceAll("\\", "/")];
    result = result.replace(new RegExp(`(?:${forms.map(escapeRegExp).join("|")})(?![\\w.-])`, "gi"), "~");
  }
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function formatLogLine(level, source, args, homeDir, now = new Date()) {
  return `${now.toISOString()} [${level}] [${source}] ${redactLogText(format(...args), homeDir)}\n`;
}
