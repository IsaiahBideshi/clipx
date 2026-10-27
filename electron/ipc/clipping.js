import { ipcMain } from "electron";

import { getClippingState, identifyScreens, listAudioApps, setDetectedGame } from "../services/obsService.js";
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
  ipcMain.handle("clipping:set-game", (_event, game) => setDetectedGame(game));
  ipcMain.handle("clipping:list-running-apps", () => listRunningApps());
  ipcMain.handle("clipping:list-game-assignments", () => listGameAssignments());
  ipcMain.handle("clipping:assign-game", (_event, exe, game) => assignGameToExe(String(exe || ""), game));
  ipcMain.handle("clipping:remove-game-assignment", (_event, exe) => removeGameAssignment(String(exe || "")));
}
