import { app, BrowserWindow, protocol } from "electron";
import path from "path";
import { fileURLToPath } from "url";

import { registerClipIpcHandlers } from "./ipc/clips.js";
import { registerFileIpcHandlers } from "./ipc/files.js";
import { registerSettingsIpcHandlers } from "./ipc/settings.js";
import { registerYoutubeIpcHandlers } from "./ipc/youtube.js";
import { registerClipxProtocol } from "./services/fileService.js";

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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
