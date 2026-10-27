import { app } from "electron";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { fetchGames } from "./gamesApi.js";
import { getForegroundWindow, listProcesses } from "../utils/foregroundWindow.js";
import {
  findAssignedProcess,
  getExeName,
  getGameMapping,
  getSteamInstall,
  guessGameName,
  isLikelyGame,
  parseGameConfigStore,
  parseSteamAppManifest,
  resolveKnownGamePath,
} from "../utils/gameMatching.js";

const execFileAsync = promisify(execFile);

function runPowerShell(command, env = {}) {
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...env } },
  );
}

const POLL_INTERVAL_MS = 2000;
const KNOWN_GAMES_REFRESH_MS = 10 * 60 * 1000;
const LOOKUP_RETRY_MS = 60 * 1000;

let pollTimer = null;
let polling = false;
let knownGamePaths = new Set();
let knownGamesLoadedAt = 0;
let mappings = null;
let current = null;
let lastGame = null;
let onGameChange = () => {};

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function describeGame(entry) {
  if (!entry) {
    return null;
  }

  return {
    exe: getExeName(entry.exePath),
    exePath: entry.exePath,
    name: entry.game?.name || entry.name,
    game: entry.game,
  };
}

function getMappingsPath() {
  return path.join(app.getPath("userData"), "games.json");
}

function getMappings() {
  if (!mappings) {
    try {
      mappings = JSON.parse(fs.readFileSync(getMappingsPath(), "utf-8"));
    } catch {
      mappings = {};
    }
  }
  return mappings;
}

async function saveMappings() {
  await fs.promises.writeFile(getMappingsPath(), JSON.stringify(getMappings(), null, 2), "utf-8");
}

async function refreshKnownGames() {
  if (Date.now() - knownGamesLoadedAt < KNOWN_GAMES_REFRESH_MS) {
    return;
  }

  knownGamesLoadedAt = Date.now();
  try {
    const { stdout } = await execFileAsync(
      "reg",
      ["query", "HKCU\\System\\GameConfigStore\\Children", "/s", "/v", "MatchedExeFullPath"],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
    knownGamePaths = parseGameConfigStore(stdout);
  } catch {
    knownGamePaths = new Set();
  }
}

async function readFileDescription(exePath) {
  try {
    const { stdout } = await runPowerShell("(Get-Item -LiteralPath $env:CLIPX_EXE).VersionInfo.FileDescription", { CLIPX_EXE: exePath });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readSteamApp(exePath) {
  const install = getSteamInstall(exePath);
  if (!install) {
    return null;
  }

  try {
    for (const entry of await fs.promises.readdir(install.steamappsDir)) {
      if (!/^appmanifest_\d+\.acf$/i.test(entry)) {
        continue;
      }
      const manifest = parseSteamAppManifest(await fs.promises.readFile(path.join(install.steamappsDir, entry), "utf-8"));
      if (manifest.installDir?.toLowerCase() === install.installDir.toLowerCase()) {
        return manifest;
      }
    }
  } catch (error) {
    console.error("ClipX: Failed to read Steam app manifests:", error);
  }
  return { appId: null, name: null, installDir: install.installDir };
}

function toClipGame(igdbGame) {
  if (!igdbGame?.id) {
    return null;
  }

  const imageId = igdbGame.cover?.image_id;
  return {
    id: igdbGame.id,
    name: igdbGame.name,
    label: igdbGame.name,
    image: imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : null,
  };
}

async function lookUpGame(exePath) {
  const steamApp = await readSteamApp(exePath);
  const name = guessGameName({
    description: steamApp?.name || await readFileDescription(exePath),
    installDir: steamApp?.installDir,
    exePath,
  });

  if (steamApp?.appId) {
    const game = toClipGame(await fetchGames({ steam: steamApp.appId }));
    if (game) {
      return { name, game };
    }
  }

  const results = name ? await fetchGames({ search: name }) : null;
  return { name, game: toClipGame(Array.isArray(results) ? results[0] : null) };
}

async function resolveCurrentGame() {
  const game = current;
  game.lookedUpAt = Date.now();

  try {
    const { name, game: match } = await lookUpGame(game.exePath);
    if (current === game && name && name !== game.name) {
      game.name = name;
      onGameChange(getCurrentGame());
    }
    if (!match) {
      return;
    }

    getMappings()[game.exePath.toLowerCase()] = { game: match, source: "auto" };
    await saveMappings();
    if (current === game) {
      game.game = match;
      onGameChange(getCurrentGame());
    }
  } catch (error) {
    console.error("ClipX: Failed to look up the running game:", error);
  }
}

async function poll() {
  if (polling) {
    return;
  }

  polling = true;
  try {
    await refreshKnownGames();
    if (current && !isProcessRunning(current.pid)) {
      lastGame = { ...current, exitedAt: Date.now() };
      current = null;
      onGameChange(getCurrentGame());
    }

    const foreground = getForegroundWindow();
    const foregroundPath = resolveKnownGamePath(foreground?.exePath, knownGamePaths);
    let target = null;
    if (foregroundPath && (getGameMapping(getMappings(), foregroundPath) || isLikelyGame(foregroundPath, knownGamePaths))) {
      target = { exePath: foregroundPath, pid: foreground.pid };
    } else if (!current) {
      const assigned = findAssignedProcess(listProcesses(), getMappings());
      target = assigned ? { exePath: assigned.exeName, pid: assigned.pid } : null;
    }
    if (!target) {
      return;
    }

    if (current?.exePath !== target.exePath) {
      const mapped = getGameMapping(getMappings(), target.exePath);
      current = { exePath: target.exePath, pid: target.pid, name: guessGameName({ exePath: target.exePath }), game: mapped?.game || null, lookedUpAt: 0 };
      onGameChange(getCurrentGame());
    }
    current.pid = target.pid;

    if (!current.game && Date.now() - current.lookedUpAt > LOOKUP_RETRY_MS) {
      await resolveCurrentGame();
    }
  } catch (error) {
    console.error("ClipX: Game detection failed:", error);
  } finally {
    polling = false;
  }
}

export function startGameDetection({ onChange } = {}) {
  onGameChange = onChange || (() => {});
  if (!pollTimer) {
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    void poll();
  }
}

export function stopGameDetection() {
  clearInterval(pollTimer);
  pollTimer = null;
  current = null;
  lastGame = null;
}

export function getCurrentGame() {
  return describeGame(current);
}

export function getGameForClip(clipSeconds) {
  const closedDuringClip = lastGame && Date.now() - lastGame.exitedAt <= clipSeconds * 1000;
  const detected = describeGame(current || (closedDuringClip ? lastGame : null));
  if (!detected) {
    return null;
  }

  return { ...(detected.game || { id: null, name: detected.name, label: detected.name, image: null }), exe: detected.exe };
}

export async function setGameForCurrentExe(game) {
  if (!current) {
    return null;
  }

  if (!game?.id) {
    return getCurrentGame();
  }

  const match = { id: game.id, name: game.name, label: game.name, image: game.image || null };

  getMappings()[current.exePath.toLowerCase()] = { game: match, source: "user" };
  await saveMappings();
  current.game = match;
  onGameChange(getCurrentGame());
  return getCurrentGame();
}

export async function listRunningApps() {
  const { stdout } = await runPowerShell("Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json -Compress");
  const parsed = JSON.parse(stdout.trim() || "[]");
  const apps = new Map();
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    const exe = `${item.ProcessName}.exe`;
    if (!apps.has(exe.toLowerCase())) {
      apps.set(exe.toLowerCase(), { exe, title: item.MainWindowTitle });
    }
  }
  return [...apps.values()].sort((a, b) => a.exe.localeCompare(b.exe));
}

export function listGameAssignments() {
  return Object.entries(getMappings())
    .filter(([key, value]) => !/[\\/]/.test(key) && value.source === "user")
    .map(([key, value]) => ({ exe: value.exe || key, game: value.game }))
    .sort((a, b) => a.exe.localeCompare(b.exe));
}

export async function assignGameToExe(exe, game) {
  const exeName = getExeName(exe);
  if (!exeName || !game?.id) {
    return listGameAssignments();
  }

  const match = { id: game.id, name: game.name, label: game.name, image: game.image || null };
  getMappings()[exeName.toLowerCase()] = { exe: exeName, game: match, source: "user" };
  await saveMappings();

  if (current && getExeName(current.exePath).toLowerCase() === exeName.toLowerCase()) {
    current.game = match;
    onGameChange(getCurrentGame());
  }
  return listGameAssignments();
}

export async function removeGameAssignment(exe) {
  delete getMappings()[getExeName(exe).toLowerCase()];
  await saveMappings();
  return listGameAssignments();
}
