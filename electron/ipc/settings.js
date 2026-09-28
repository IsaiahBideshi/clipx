import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { getSupabaseAccessToken } from "./authStorage.js";

const STARTUP_MINIMIZED_ARG = "--clipx-startup-minimized";
const API_BASE = (process.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");

async function fetchGames(params) {
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

function getLoginItemOptions(openAtLogin, { includeStartupArg = true } = {}) {
  const options = {};
  const startupArgs = includeStartupArg ? [STARTUP_MINIMIZED_ARG] : [];

  if (typeof openAtLogin === "boolean") {
    options.openAtLogin = openAtLogin;
  }

  if (!app.isPackaged && process.defaultApp) {
    options.path = process.execPath;
    options.args = [app.getAppPath(), ...startupArgs];
  } else if (startupArgs.length > 0) {
    options.args = startupArgs;
  }

  return options;
}

function getLaunchAtStartupEnabled() {
  return (
    app.getLoginItemSettings(getLoginItemOptions()).openAtLogin ||
    app.getLoginItemSettings(getLoginItemOptions(undefined, { includeStartupArg: false })).openAtLogin
  );
}

function setLaunchAtStartupEnabled(openAtLogin) {
  if (!openAtLogin) {
    app.setLoginItemSettings(getLoginItemOptions(false, { includeStartupArg: false }));
  }

  app.setLoginItemSettings(getLoginItemOptions(openAtLogin));
}

export function registerSettingsIpcHandlers() {
  ipcMain.handle("get-taglist", async () => {
    const taglistPath = path.join(app.getPath("appData"), "clipx", "taglist.json");

    try {
      const data = await fs.promises.readFile(taglistPath, "utf-8");
      return data.trim() ? JSON.parse(data) : [];
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const appDataDir = path.dirname(taglistPath);
        await fs.promises.mkdir(appDataDir, { recursive: true });
        await fs.promises.writeFile(taglistPath, "", "utf-8");
        return [];
      }

      console.error("ClipX: Failed to read taglist.json:", error);
      return [];
    }
  });

  ipcMain.handle("save-taglist", async (_event, taglist) => {
    const taglistPath = path.join(app.getPath("appData"), "clipx", "taglist.json");

    try {
      const appDataDir = path.dirname(taglistPath);
      await fs.promises.mkdir(appDataDir, { recursive: true });
      await fs.promises.writeFile(taglistPath, JSON.stringify(taglist, null, 2), "utf-8");
    } catch (error) {
      console.error("ClipX: Failed to save taglist.json:", error);
      throw error;
    }
  });

  ipcMain.handle("get-game-data", async (_event, gameId) => {
    if (!gameId) {
      console.error("No game ID provided for get-game-data");
      return null;
    }

    const idNum = Number(gameId);
    if (!Number.isFinite(idNum)) {
      console.warn("Invalid game ID provided for get-game-data:", gameId);
      return null;
    }

    const game = await fetchGames({ id: idNum });
    if (game) {
      return {
        image: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : null,
        label: game.name,
        first_release_date: game.first_release_date
      };
    }

    console.warn("No game data found for ID:", gameId);
    return null;
  });

  ipcMain.handle("search-games", async (_event, query) => {
    if (typeof query !== "string") {
      return [];
    }

    return (await fetchGames({ search: query })) || [];
  });

  ipcMain.handle("get-options", async () => {
    const optionsPath = path.join(app.getPath("appData"), "clipx", "options.json");

    try {
      const data = await fs.promises.readFile(optionsPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const appDataDir = path.dirname(optionsPath);
        await fs.promises.mkdir(appDataDir, { recursive: true });
        await fs.promises.writeFile(optionsPath, "", "utf-8");
        return {};
      }

      console.error("ClipX: Failed to read options.json:", error);
      return {};
    }
  });

  ipcMain.handle("save-options", async (_event, options) => {
    const optionsPath = path.join(app.getPath("appData"), "clipx", "options.json");

    try {
      let previousClipsFolder = null;
      try {
        const previousData = await fs.promises.readFile(optionsPath, "utf-8");
        previousClipsFolder = previousData ? JSON.parse(previousData).clipsFolder : null;
      } catch (error) {
        if (error && error.code !== "ENOENT") {
          console.error("ClipX: Failed to read previous options.json:", error);
        }
      }

      const appDataDir = path.dirname(optionsPath);
      await fs.promises.mkdir(appDataDir, { recursive: true });
      await fs.promises.writeFile(optionsPath, JSON.stringify(options, null, 2), "utf-8");

      if ((previousClipsFolder || "") !== (options?.clipsFolder || "")) {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send("options:changed", { clipsFolder: options?.clipsFolder || null });
          }
        }
      }
    } catch (error) {
      console.error("ClipX: Failed to save options.json:", error);
      throw error;
    }
  });

  ipcMain.handle("get-launch-at-startup", async () => {
    return getLaunchAtStartupEnabled();
  });

  ipcMain.handle("set-launch-at-startup", async (_event, enabled) => {
    const openAtLogin = Boolean(enabled);
    setLaunchAtStartupEnabled(openAtLogin);
    return getLaunchAtStartupEnabled();
  });
}
