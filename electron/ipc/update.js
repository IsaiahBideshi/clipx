import { ipcMain } from "electron";

import {
  getUpdateState,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  installUpdate,
} from "../services/updateService.js";

export function registerUpdateIpcHandlers() {
  ipcMain.handle("updates:get-state", () => getUpdateState());
  ipcMain.handle("updates:check", () => checkForUpdates());
  ipcMain.handle("updates:download", () => downloadUpdate());
  ipcMain.handle("updates:cancel-download", () => cancelDownload());
  ipcMain.handle("updates:install", () => installUpdate());
}