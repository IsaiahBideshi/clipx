import { BrowserWindow, dialog, ipcMain } from "electron";

import { generateThumbnail, scanFolder } from "../services/fileService.js";
import { clipIndexEvents, listLocalClips, refreshLocalClipIndex } from "../services/clipIndexService.js";

let clipIndexForwarderRegistered = false;

function registerClipIndexForwarder() {
  if (clipIndexForwarderRegistered) {
    return;
  }

  clipIndexForwarderRegistered = true;
  clipIndexEvents.on("change", (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send("local-clips:index-changed", event);
      }
    }
  });
}

export function registerFileIpcHandlers() {
  registerClipIndexForwarder();
  // ============= HANDLERS =============

  ipcMain.handle("pick-video-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Videos", extensions: ["mp4", "mkv", "mov"] }],
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });



  ipcMain.handle("pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });



  ipcMain.handle("scan-folder", async (_event, folderPath) => {
    return await scanFolder(folderPath);
  });

  ipcMain.handle("local-clips:list", async (_event, options) => {
    return listLocalClips(options);
  });

  ipcMain.handle("local-clips:refresh-index", async (_event, options) => {
    return await refreshLocalClipIndex(options);
  });


  
  ipcMain.handle("get-thumbnail", async (_event, clipPath, baseFolder) => {
    if (typeof clipPath !== "string" || clipPath.length === 0) {
      throw new TypeError("get-thumbnail: clipPath must be a non-empty string");
    }

    return await generateThumbnail(clipPath);
  });
}
