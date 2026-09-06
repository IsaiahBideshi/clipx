import { app, ipcMain } from "electron";

import { getClipData, renameClip, saveClip, uploadClip, deleteClip, deleteClipBlob, ClipServiceError } from "../services/clipService.js";

export function registerClipIpcHandlers() {
  ipcMain.handle("save-clip", async (_event, options) => {
    return await saveClip(options);
  });

  ipcMain.handle("rename-clip", async (_event, clipPath, newName) => {
    try {
      return { ok: true, ...(await renameClip(clipPath, newName)) };
    } catch (error) {
      if (error instanceof ClipServiceError) {
        return { ok: false, statusCode: error.statusCode, message: error.message };
      }
      throw error;
    }
  });

  ipcMain.handle("upload-clip", async (_event, options) => {
    return await uploadClip(app, options);
  });

  ipcMain.handle("get-clip-data", async (_event, clipPath) => {
    return await getClipData(clipPath);
  });

  ipcMain.handle("delete-clip", async (_event, clipPath) => {
    return await deleteClip(clipPath);
  });

  ipcMain.handle("delete-clip-blob", async (_event, options) => {
    return await deleteClipBlob(options);
  });
}
