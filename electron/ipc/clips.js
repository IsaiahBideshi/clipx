import { app, ipcMain } from "electron";

import { getClipData, saveClip, uploadClip } from "../services/clipService.js";

export function registerClipIpcHandlers() {
  ipcMain.handle("save-clip", async (_event, options) => {
    return await saveClip(options);
  });

  ipcMain.handle("upload-clip", async (_event, options) => {
    return await uploadClip(app, options);
  });

  ipcMain.handle("get-clip-data", async (_event, clipPath) => {
    return await getClipData(clipPath);
  });
}
