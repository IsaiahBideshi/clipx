import { app, BrowserWindow, Menu, protocol, Tray } from "electron";
import http from "http";
import fs from "fs";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";

import { registerClipIpcHandlers } from "./ipc/clips.js";
import { registerFileIpcHandlers } from "./ipc/files.js";
import { registerSettingsIpcHandlers } from "./ipc/settings.js";
import { registerYoutubeIpcHandlers } from "./ipc/youtube.js";
import { registerClipxProtocol } from "./services/fileService.js";
import { closeClipIndexService } from "./services/clipIndexService.js";
import { registerGoogleAuthIpcHandlers } from "./ipc/googleAuth.js";
import { registerAuthStorageIpcHandlers } from "./ipc/authStorage.js";
import { registerUpdateIpcHandlers, registerUpdateWindowGuards, scheduleInitialUpdateCheck } from "./services/updateService.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.join(__dirname, "assets", "clipx_icon.ico");
const isDev = !app.isPackaged;
const devServerUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:5173";
const distPath = path.join(app.getAppPath(), "dist");
let rendererServer = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

const STATIC_MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".mjs": "text/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=UTF-8",
  ".map": "application/json; charset=UTF-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return STATIC_MIME_TYPES[ext] || "application/octet-stream";
}

async function startRendererServer() {
  if (rendererServer) {
    return rendererServer.url;
  }

  const server = http.createServer((req, res) => {
    if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
      res.writeHead(405);
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(requestUrl.pathname || "/");

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const relativePath = pathname.replace(/^\/+/, "");
    let filePath = path.normalize(path.join(distPath, relativePath));

    if (!filePath.toLowerCase().startsWith(distPath.toLowerCase())) {
      filePath = path.join(distPath, "index.html");
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(distPath, "index.html");
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    console.log(`Serving ${filePath} for request ${req.url}`);

    const contentType = getContentType(filePath);
    res.writeHead(200, { "Content-Type": contentType });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      console.error("ClipX: Failed to serve", filePath, error);
      res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  });

  const url = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

  rendererServer = { server, url };
  return url;
}

function stopRendererServer() {
  if (rendererServer?.server) {
    rendererServer.server.close();
    rendererServer = null;
  }
}

function getOptionsPath() {
  return path.join(app.getPath("appData"), "clipx", "options.json");
}

function getStoredOptions() {
  try {
    const data = fs.readFileSync(getOptionsPath(), "utf-8");
    return data.trim() ? JSON.parse(data) : {};
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("ClipX: Failed to read options.json:", error);
    }
    return {};
  }
}

function shouldMinimizeToTrayOnClose() {
  return getStoredOptions().minimizeToTrayOnClose === true;
}

function ensureTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(appIconPath);
  tray.setToolTip("ClipX");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Show ClipX",
      click: () => {
        showMainWindow();
      },
    },
    {
      type: "separator",
    },
    {
      label: "Quit ClipX",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", () => {
    showMainWindow();
  });

  return tray;
}

async function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

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
  {
    scheme: "clipx-video",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.registerFileProtocol("clipx", (request, callback) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname || "");

      if (!pathname || pathname === "/") {
        pathname = "/index.html";
      }

      const relativePath = pathname.replace(/^\/+/, "");
      let filePath = path.normalize(path.join(distPath, relativePath));

      if (!filePath.startsWith(distPath)) {
        filePath = path.join(distPath, "index.html");
      }

      if (!fs.existsSync(filePath)) {
        filePath = path.join(distPath, "index.html");
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      callback({ path: filePath });
    } catch (error) {
      console.error("ClipX: Failed to resolve app:// URL", error);
      callback({ path: path.join(app.getAppPath(), "dist", "index.html") });
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 850,
    fullscreenable: true,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  win.on("close", (event) => {
    if (isQuitting) {
      setTimeout(() => {
        if (BrowserWindow.getAllWindows().some((window) => !window.isDestroyed())) {
          isQuitting = false;
        }
      }, 0);
      return;
    }

    if (!shouldMinimizeToTrayOnClose()) {
      return;
    }

    event.preventDefault();
    event.clipxMinimizedToTray = true;
    ensureTray();
    win.hide();
  });
  registerUpdateWindowGuards(win);

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
      return win;
    } catch (error) {
      console.warn(`Failed to load dev URL (${devServerUrl}), falling back to dist build.`, error);
    }
  }

  const rendererUrl = await startRendererServer();
  await win.loadURL(rendererUrl);
  return win;
}

function registerIpcHandlers() {
  registerAuthStorageIpcHandlers();
  registerFileIpcHandlers();
  registerSettingsIpcHandlers();
  registerClipIpcHandlers();
  registerYoutubeIpcHandlers();
  registerGoogleAuthIpcHandlers();
  registerUpdateIpcHandlers();
}

app.setAppUserModelId("com.isaiah.clipx");
app.whenReady().then(async () => {
  registerClipxProtocol(protocol);
  registerAppProtocol();
  registerIpcHandlers();
  await createWindow();
  scheduleInitialUpdateCheck();
});

app.on("activate", () => {
  showMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  closeClipIndexService();
  stopRendererServer();
});
