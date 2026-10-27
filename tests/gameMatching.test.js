import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAssignedProcess,
  getGameMapping,
  getSteamInstall,
  guessGameName,
  isLikelyGame,
  parseGameConfigStore,
  parseSteamAppManifest,
  resolveKnownGamePath,
} from "../electron/utils/gameMatching.js";

test("reads game exe paths from the GameConfigStore registry dump", () => {
  const output = [
    "HKEY_CURRENT_USER\\System\\GameConfigStore\\Children\\0a1b",
    "    MatchedExeFullPath    REG_SZ    C:\\Riot Games\\VALORANT\\live\\VALORANT.exe",
    "",
    "HKEY_CURRENT_USER\\System\\GameConfigStore\\Children\\0a1c",
    "    MatchedExeFullPath    REG_SZ    D:\\Games\\Minecraft\\javaw.exe",
  ].join("\r\n");
  assert.deepEqual([...parseGameConfigStore(output)], ["c:\\riot games\\valorant\\live\\valorant.exe", "d:\\games\\minecraft\\javaw.exe"]);
});

test("treats known and store-installed games as games but not launchers", () => {
  const known = new Set(["d:\\games\\minecraft\\javaw.exe"]);
  assert.equal(isLikelyGame("D:\\Games\\Minecraft\\javaw.exe", known), true);
  assert.equal(isLikelyGame("C:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe"), true);
  assert.equal(isLikelyGame("C:\\Program Files (x86)\\Steam\\steam.exe"), false);
  assert.equal(isLikelyGame("C:\\Riot Games\\Riot Client\\RiotClientServices.exe"), false);
  assert.equal(isLikelyGame("C:\\Windows\\explorer.exe"), false);
});

test("finds the Steam library folder and reads app manifests", () => {
  assert.deepEqual(getSteamInstall("D:\\SteamLibrary\\steamapps\\common\\Apex Legends\\r5apex.exe"), {
    steamappsDir: "D:\\SteamLibrary\\steamapps",
    installDir: "Apex Legends",
  });
  assert.equal(getSteamInstall("C:\\Games\\game.exe"), null);
  assert.deepEqual(parseSteamAppManifest('"AppState"\n{\n\t"appid"\t\t"730"\n\t"name"\t\t"Counter-Strike 2"\n\t"installdir"\t\t"Counter-Strike Global Offensive"\n}'), {
    appId: "730",
    name: "Counter-Strike 2",
    installDir: "Counter-Strike Global Offensive",
  });
});

test("guesses a searchable game name", () => {
  assert.equal(guessGameName({ description: "Rocket League", exePath: "C:\\x\\RocketLeague.exe" }), "Rocket League");
  assert.equal(guessGameName({ installDir: "Apex Legends", exePath: "C:\\x\\r5apex.exe" }), "Apex Legends");
  assert.equal(guessGameName({ exePath: "C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe" }), "VALORANT");
  assert.equal(guessGameName({ description: "League of Legends (TM) Client", exePath: "C:\\x\\League of Legends.exe" }), "League of Legends");
  assert.equal(guessGameName({ description: "Rocket League®", exePath: "C:\\x\\RocketLeague.exe" }), "Rocket League");
  assert.equal(guessGameName({}), null);
});

test("looks up a game by full path first, then by an assigned exe name", () => {
  const mappings = {
    "c:\\games\\bo2\\t6mp.exe": { game: { id: 1 } },
    "plutonium-bootstrapper-win32.exe": { game: { id: 2 } },
  };
  assert.equal(getGameMapping(mappings, "C:\\Games\\BO2\\t6mp.exe").game.id, 1);
  assert.equal(getGameMapping(mappings, "D:\\Plutonium\\bin\\Plutonium-Bootstrapper-Win32.exe").game.id, 2);
  assert.equal(getGameMapping(mappings, "Plutonium-Bootstrapper-Win32.exe").game.id, 2);
  assert.equal(getGameMapping(mappings, "C:\\Other\\t6mp.exe"), null);
});

test("finds a running app that has a game assigned", () => {
  const mappings = {
    "c:\\games\\x\\game.exe": { game: { id: 1 } },
    "plutonium-bootstrapper-win32.exe": { game: { id: 2 } },
  };
  const processes = [
    { pid: 4, exeName: "System" },
    { pid: 900, exeName: "game.exe" },
    { pid: 1200, exeName: "Plutonium-Bootstrapper-Win32.exe" },
  ];
  assert.deepEqual(findAssignedProcess(processes, mappings), { pid: 1200, exeName: "Plutonium-Bootstrapper-Win32.exe" });
  assert.equal(findAssignedProcess(processes.slice(0, 2), mappings), null);
  assert.equal(findAssignedProcess(processes, { "c:\\games\\x\\game.exe": {} }), null);
});

test("finds the full path of a game whose path can't be read", () => {
  const known = new Set(["c:\\riot games\\league of legends\\game\\league of legends.exe"]);
  assert.equal(resolveKnownGamePath("League of Legends.exe", known), "c:\\riot games\\league of legends\\game\\league of legends.exe");
  assert.equal(resolveKnownGamePath("other.exe", known), "other.exe");
  assert.equal(resolveKnownGamePath("C:\\Games\\game.exe", known), "C:\\Games\\game.exe");
  assert.equal(resolveKnownGamePath(null, known), null);
});
