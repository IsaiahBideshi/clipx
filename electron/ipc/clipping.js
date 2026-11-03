import { ipcMain } from "electron";

import { getAppIcon, getClippingState, identifyScreens, listAudioApps, previewToast, setDetectedGame } from "../services/obsService.js";
import {
  assignGameToExe,
  listGameAssignments,
  listRunningApps,
  removeGameAssignment,
} from "../services/gameDetectionService.js";

export function registerClippingIpcHandlers() {
  ipcMain.handle("clipping:get-state", () => getClippingState());
  ipcMain.handle("clipping:identify-screens", () => identifyScreens());
  ipcMain.handle("clipping:list-audio-apps", () => listAudioApps());
  ipcMain.handle("clipping:get-app-icon", (_event, exe) => getAppIcon(String(exe || "")));
  ipcMain.handle("clipping:set-game", (_event, game) => setDetectedGame(game));
  ipcMain.handle("clipping:preview-toast", () => previewToast());
  ipcMain.handle("clipping:list-running-apps", () => listRunningApps());
  ipcMain.handle("clipping:list-game-assignments", () => listGameAssignments());
  ipcMain.handle("clipping:assign-game", (_event, exe, game) => assignGameToExe(String(exe || ""), game));
  ipcMain.handle("clipping:remove-game-assignment", (_event, exe) => removeGameAssignment(String(exe || "")));
}
