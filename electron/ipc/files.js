import { dialog, ipcMain } from "electron";
import path from "path";

import { generateThumbnail, scanFolder } from "../services/fileService.js";

export function registerFileIpcHandlers() {
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

  ipcMain.handle("get-thumbnail", async (_event, clipPath, baseFolder) => {
    if (typeof clipPath !== "string" || clipPath.length === 0) {
      throw new TypeError("get-thumbnail: clipPath must be a non-empty string");
    }

    const safeBaseFolder =
      typeof baseFolder === "string" && baseFolder.length > 0
        ? baseFolder
        : path.dirname(clipPath);

    const thumbsDir = path.join(safeBaseFolder, "thumbs");
    return await generateThumbnail(clipPath, thumbsDir);
  });
}
