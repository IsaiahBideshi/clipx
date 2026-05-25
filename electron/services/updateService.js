import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

let latestState = {
  status: "idle",
  currentVersion: app.getVersion(),
};
let isChecking = false;
let hasAvailableUpdate = false;
let isDownloading = false;
let hasDownloadedUpdate = false;

function emitUpdateState(state) {
  latestState = {
    currentVersion: app.getVersion(),
    ...state,
  };

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("updates:state", latestState);
  }
}

function toUpdateInfo(updateInfo = {}) {
  return {
    version: updateInfo.version,
    releaseName: updateInfo.releaseName,
    releaseDate: updateInfo.releaseDate,
    releaseNotes: Array.isArray(updateInfo.releaseNotes)
      ? updateInfo.releaseNotes.map((note) => note.note).filter(Boolean).join("\n\n")
      : updateInfo.releaseNotes,
  };
}

function toErrorMessage(error) {
  if (!error) {
    return "The update could not be completed.";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || "The update could not be completed.";
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    emitUpdateState({
      status: "disabled",
      message: "Update checks run only in the packaged app.",
    });
    return latestState;
  }

  if (isChecking) {
    return latestState;
  }

  isChecking = true;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emitUpdateState({
      status: "error",
      message: toErrorMessage(error),
    });
  } finally {
    isChecking = false;
  }

  return latestState;
}

async function downloadUpdate() {
  if (!hasAvailableUpdate) {
    return latestState;
  }

  if (isDownloading || hasDownloadedUpdate) {
    return latestState;
  }

  isDownloading = true;

  try {
    emitUpdateState({
      ...latestState,
      status: "downloading",
      progress: 0,
    });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    isDownloading = false;
    emitUpdateState({
      status: "error",
      message: toErrorMessage(error),
    });
  }

  return latestState;
}

function installUpdate() {
  if (!hasDownloadedUpdate) {
    return {
      ...latestState,
      ok: false,
      message: "No downloaded update is ready to install.",
    };
  }

  autoUpdater.quitAndInstall(false, true);
  return {
    ...latestState,
    ok: true,
  };
}

export function scheduleInitialUpdateCheck(delayMs = 5000) {
  if (!app.isPackaged) {
    return;
  }

  setTimeout(() => {
    checkForUpdates();
  }, delayMs);
}

export function registerUpdateIpcHandlers() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    emitUpdateState({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    hasAvailableUpdate = true;
    emitUpdateState({
      status: "available",
      update: toUpdateInfo(info),
    });
  });

  autoUpdater.on("update-not-available", () => {
    hasAvailableUpdate = false;
    emitUpdateState({ status: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitUpdateState({
      ...latestState,
      status: "downloading",
      progress: Math.round(progress.percent || 0),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    isDownloading = false;
    hasDownloadedUpdate = true;
    emitUpdateState({
      status: "downloaded",
      update: toUpdateInfo(info),
    });
  });

  autoUpdater.on("error", (error) => {
    isChecking = false;
    isDownloading = false;
    emitUpdateState({
      status: "error",
      message: toErrorMessage(error),
    });
  });

  ipcMain.handle("updates:get-state", () => latestState);
  ipcMain.handle("updates:check", () => checkForUpdates());
  ipcMain.handle("updates:download", () => downloadUpdate());
  ipcMain.handle("updates:install", () => installUpdate());
}
