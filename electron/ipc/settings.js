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

    console.log("Searching games for query:", query);

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
