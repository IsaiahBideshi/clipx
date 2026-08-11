import { ipcMain } from "electron";
import { mainWindow } from "../main.js";

export function registerWindowControlIpcHandlers() {
  const getWindowState = () => ({
    maximized: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()),
    fullscreen: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()),
  });

  ipcMain.handle("window:get-state", () => getWindowState());

  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle("window:toggle-fullscreen", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });
}