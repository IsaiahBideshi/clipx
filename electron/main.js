import { app, BrowserWindow, protocol } from "electron";
import path from "path";
import { fileURLToPath } from "url";

import { registerClipIpcHandlers } from "./ipc/clips.js";
import { registerFileIpcHandlers } from "./ipc/files.js";
import { registerSettingsIpcHandlers } from "./ipc/settings.js";
import { registerYoutubeIpcHandlers } from "./ipc/youtube.js";
import { registerClipxProtocol } from "./services/fileService.js";

import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  "https://vymaqpjhajwpbzmnoadk.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5bWFxcGpoYWp3cGJ6bW5vYWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA1Mjk1NCwiZXhwIjoyMDg3NjI4OTU0fQ.piV5SVH0zQBTJ3UcKDjiUsdzu5aVnk5fGjG4y3bzFKM"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  {
    scheme: "clipx",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 850,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Support the browser Fullscreen API (used by YouTube's fullscreen button)
  win.webContents.on("enter-html-full-screen", () => {
    win.setFullScreen(true);
  });
  win.webContents.on("leave-html-full-screen", () => {
    win.setFullScreen(false);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open all links in the user's default browser
    return { action: "deny" };
  });

  win.maximize();
  win.loadURL("http://localhost:5173");
  win.webContents.openDevTools();
}

function registerIpcHandlers() {
  registerFileIpcHandlers();
  registerSettingsIpcHandlers();
  registerClipIpcHandlers();
  registerYoutubeIpcHandlers();
}

app.whenReady().then(() => {
  createWindow();
  registerClipxProtocol(protocol);
  registerIpcHandlers();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
