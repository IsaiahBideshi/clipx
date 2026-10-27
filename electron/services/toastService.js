import { BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOAST_WIDTH = 380;
const TOAST_HEIGHT = 110;
const TOAST_LIFETIME_MS = 4400;

let toastWindow = null;
let toastReady = null;
let closeTimer = null;

function getToastBounds(display, corner) {
  const { x, y, width } = display.bounds;
  return {
    x: corner === "left" ? x : x + width - TOAST_WIDTH,
    y,
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
  };
}

function getToastWindow() {
  if (toastWindow && !toastWindow.isDestroyed()) {
    return toastReady;
  }

  const win = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true);

  toastWindow = win;
  toastReady = win.loadFile(path.join(__dirname, "..", "toastWindow.html")).then(() => win);
  return toastReady;
}

export async function showToast({ display, corner, visible, sound, volume, kind, title, detail }) {
  if (!visible && !sound) {
    return;
  }

  const win = await getToastWindow();
  if (win.isDestroyed()) {
    return;
  }

  win.setBounds(getToastBounds(display, corner));
  if (visible) {
    win.showInactive();
  }
  win.webContents.send("toast:show", { corner, visible, sound, volume, kind, title, detail });

  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (!win.isDestroyed()) {
      win.destroy();
    }
    if (toastWindow === win) {
      toastWindow = null;
    }
  }, TOAST_LIFETIME_MS);
}
