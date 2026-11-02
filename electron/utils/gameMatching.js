const GAME_FOLDER_PATTERNS = [
  /\\steamapps\\common\\/i,
  /\\epic games\\/i,
  /\\riot games\\/i,
  /\\xboxgames\\/i,
  /\\gog galaxy\\games\\/i,
  /\\ea games\\/i,
  /\\ubisoft game launcher\\games\\/i,
];

const LAUNCHER_EXES = new Set([
  "steam.exe",
  "steamwebhelper.exe",
  "epicgameslauncher.exe",
  "riotclientservices.exe",
  "riotclientux.exe",
  "riotclientuxrender.exe",
  "battle.net.exe",
  "eadesktop.exe",
  "galaxyclient.exe",
  "upc.exe",
]);

export function getExeName(exePath) {
  return String(exePath || "").split(/[\\/]/).pop();
}

export function parseGameConfigStore(output) {
  const paths = new Set();
  for (const match of String(output || "").matchAll(/MatchedExeFullPath\s+REG_SZ\s+(.+)/g)) {
    paths.add(match[1].trim().toLowerCase());
  }
  return paths;
}

export function resolveKnownGamePath(exePath, knownGamePaths = new Set()) {
  const value = String(exePath || "");
  if (!value || /[\\/]/.test(value)) {
    return value || null;
  }

  const exeName = value.toLowerCase();
  return [...knownGamePaths].find((knownPath) => getExeName(knownPath) === exeName) || value;
}

export function getGameMapping(mappings, exePath) {
  const value = String(exePath || "").toLowerCase();
  return mappings[value] || mappings[getExeName(value)] || null;
}

export function findAssignedProcess(processes, mappings) {
  const assigned = new Set(Object.keys(mappings).filter((key) => !/[\\/]/.test(key)));
  if (!assigned.size) {
    return null;
  }
  return processes.find((process) => assigned.has(String(process.exeName).toLowerCase())) || null;
}

export function isLikelyGame(exePath, knownGamePaths = new Set()) {
  const lower = String(exePath || "").toLowerCase();
  if (!lower || LAUNCHER_EXES.has(getExeName(lower))) {
    return false;
  }
  return knownGamePaths.has(lower) || GAME_FOLDER_PATTERNS.some((pattern) => pattern.test(lower));
}

export function getSteamInstall(exePath) {
  const match = /^(.*\\steamapps)\\common\\([^\\]+)\\/i.exec(String(exePath || ""));
  return match ? { steamappsDir: match[1], installDir: match[2] } : null;
}

export function parseSteamAppManifest(text) {
  const read = (key) => new RegExp(`"${key}"\\s+"([^"]*)"`, "i").exec(String(text || ""))?.[1] || null;
  return { appId: read("appid"), name: read("name"), installDir: read("installdir") };
}

function cleanGameName(value) {
  return String(value || "")
    .replace(/\s*(\((tm|r)\)|™|®)/gi, "")
    .replace(/\s+(client|launcher)$/i, "")
    .trim();
}

export function guessGameName({ description, installDir, exePath }) {
  const exeName = getExeName(exePath)
    .replace(/\.exe$/i, "")
    .replace(/([-_ ](win64|win32|x64|x86|shipping|dx11|dx12|vulkan))+$/i, "");
  return [description, installDir, exeName].map(cleanGameName).find(Boolean) || null;
}
