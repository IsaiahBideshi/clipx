import { app, ipcMain } from "electron";

import { getClipData, renameClip, saveClip, uploadClip } from "../services/clipService.js";

export function registerClipIpcHandlers() {
  ipcMain.handle("save-clip", async (_event, options) => {
    return await saveClip(options);
  });

  ipcMain.handle("rename-clip", async (_event, clipPath, newName) => {
    return await renameClip(clipPath, newName);
  });

  ipcMain.handle("upload-clip", async (_event, options) => {
    return await uploadClip(app, options);
  });

  ipcMain.handle("get-clip-data", async (_event, clipPath) => {
    return await getClipData(clipPath);
  });
}
