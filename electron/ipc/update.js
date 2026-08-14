import { ipcMain } from "electron";

import {
  getUpdateState,
  checkForUpdates,
  installUpdate,
} from "../services/updateService.js";

export function registerUpdateIpcHandlers() {
  ipcMain.handle("updates:get-state", () => getUpdateState());
  ipcMain.handle("updates:check", () => checkForUpdates());
  ipcMain.handle("updates:install", () => installUpdate());
}