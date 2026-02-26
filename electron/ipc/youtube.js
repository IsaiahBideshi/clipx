import { ipcMain, shell } from "electron";

import { getGoogleInfo, linkYoutube, unlinkYoutube } from "../services/youtubeService.js";

export function registerYoutubeIpcHandlers() {
  ipcMain.handle("link-youtube", async () => {
    return await linkYoutube(shell);
  });

  ipcMain.handle("unlink-youtube", async () => {
    await unlinkYoutube();
  });

  ipcMain.handle("get-google-info", async () => {
    return await getGoogleInfo();
  });
}
