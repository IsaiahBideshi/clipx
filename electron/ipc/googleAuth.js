import { ipcMain, shell } from "electron";

import { signInWithGoogle } from "../services/googleAuthService.js";

export function registerGoogleAuthIpcHandlers() {
  ipcMain.handle("sign-in-with-google", async () => {
    return await signInWithGoogle(shell);
  });
}