import { ipcMain } from "electron";

import { getClippingState } from "../services/obsService.js";

export function registerClippingIpcHandlers() {
  ipcMain.handle("clipping:get-state", () => getClippingState());
}
