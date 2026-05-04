import { app, BrowserWindow, protocol } from "electron";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";

import { registerClipIpcHandlers } from "./ipc/clips.js";
import { registerFileIpcHandlers } from "./ipc/files.js";
import { registerSettingsIpcHandlers } from "./ipc/settings.js";
import { registerYoutubeIpcHandlers } from "./ipc/youtube.js";
import { registerClipxProtocol } from "./services/fileService.js";
import { registerGoogleAuthIpcHandlers } from "./ipc/googleAuth.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const devServerUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:5173";
const rendererIndexPath = path.join(app.getAppPath(), "dist", "index.html");

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

async function createWindow() {
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
  if (isDev) {
    try {
      await win.loadURL(devServerUrl);
      return;
    } catch (error) {
      console.warn(`Failed to load dev URL (${devServerUrl}), falling back to dist build.`, error);
    }
  }

  await win.loadFile(rendererIndexPath);
}

function registerIpcHandlers() {
  registerFileIpcHandlers();
  registerSettingsIpcHandlers();
  registerClipIpcHandlers();
  registerYoutubeIpcHandlers();
  registerGoogleAuthIpcHandlers();
}

app.whenReady().then(async () => {
  registerClipxProtocol(protocol);
  registerIpcHandlers();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
