import { ipcMain, shell } from "electron";

import { getGoogleInfo, linkYoutube, unlinkYoutube } from "../services/youtubeService.js";

export function registerYoutubeIpcHandlers() {
  ipcMain.handle("link-youtube", async (_event, userId) => {
    return await linkYoutube(shell, userId);
  });

  ipcMain.handle("unlink-youtube", async (_event, userId) => {
    await unlinkYoutube(userId);
  });

  ipcMain.handle("get-google-info", async (_event, userId) => {
    return await getGoogleInfo(userId);
  });
}
