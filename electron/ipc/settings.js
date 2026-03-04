import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

export function registerSettingsIpcHandlers() {
  ipcMain.handle("get-taglist", async () => {
    const taglistPath = path.join(app.getPath("appData"), "clipx", "taglist.json");

    try {
      const data = await fs.promises.readFile(taglistPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const appDataDir = path.dirname(taglistPath);
        await fs.promises.mkdir(appDataDir, { recursive: true });
        await fs.promises.writeFile(taglistPath, "", "utf-8");
        console.log("ClipX: Created new taglist.json at", taglistPath);
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
    const headers = {
      "Client-ID": "31woiu66m2oeotccavjhhgaeg26jdg",
      Authorization: "Bearer vkibr6jlgoaw8uh9bk9dgacdx14gjv",
      "Content-Type": "text/plain",
      Accept: "application/json",
    };

    const idNum = Number(gameId);
    if (!Number.isFinite(idNum)) {
      console.warn("Invalid game ID provided for get-game-data:", gameId);
      return null;
    }

    const response = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers,
      body: `
        fields name, cover.image_id, first_release_date;
        where id = ${idNum} & game_type = 0;
        limit 1;
      `,
    });

    const data = await response.json();
    if (data.length > 0) {
      return {
        image: data[0].cover.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${data[0].cover.image_id}.jpg` : null,
        label: data[0].name,
        first_release_date: data[0].first_release_date
      };
    }

    console.warn("No game data found for ID:", gameId);
    return null;
  });

  ipcMain.handle("search-games", async (_event, query) => {
    if (typeof query !== "string") {
      return [];
    }

    const headers = {
      "Client-ID": "31woiu66m2oeotccavjhhgaeg26jdg",
      Authorization: "Bearer vkibr6jlgoaw8uh9bk9dgacdx14gjv",
      "Content-Type": "text/plain",
      Accept: "application/json",
    };


    const response = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers,
      body: `
      fields name,cover.url, cover.image_id, total_rating_count, first_release_date;
      search "${query}";
      where game_type = 0;
      limit 5;
    `,
    });

    const data = await response.json();
    data.sort((a, b) => (b.total_rating_count || 0) - (a.total_rating_count || 0));
    return data;
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
      const appDataDir = path.dirname(optionsPath);
      await fs.promises.mkdir(appDataDir, { recursive: true });
      await fs.promises.writeFile(optionsPath, JSON.stringify(options, null, 2), "utf-8");
    } catch (error) {
      console.error("ClipX: Failed to save options.json:", error);
      throw error;
    }
  });
}
