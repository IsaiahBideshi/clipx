import { app, BrowserWindow } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let latestState = { status: "idle", currentVersion: app.getVersion() };
let availableUpdate = null;
let isChecking = false;
let hasDownloadedUpdate = false;
let autoInstallOnDownload = true;
let recurringCheckInterval = null;

function emitUpdateState(state) {
  latestState = {
    currentVersion: app.getVersion(),
    update: availableUpdate,
    ...state,
  };

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("updates:state", latestState);
    }
  }
}

function toReleaseVersion(version) {
  const value = String(version || "").trim();
  if (!value) {
    return null;
  }

  return `v${value.replace(/^v/i, "")}`;
}

function toVersionedReleaseNotes(releaseNotes = []) {
  return releaseNotes
    .map((note) => {
      const body = String(note?.note || "").trim();
      if (!body) {
        return "";
      }

      const version = toReleaseVersion(note?.version);
      return version ? `<h2>${version}</h2>\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n");
}

function toUpdateInfo(updateInfo = {}) {
  return {
    version: updateInfo.version,
    releaseName: updateInfo.releaseName,
    releaseDate: updateInfo.releaseDate,
    releaseNotes: Array.isArray(updateInfo.releaseNotes)
      ? toVersionedReleaseNotes(updateInfo.releaseNotes)
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

export function getUpdateState() {
  return latestState;
}

export async function checkForUpdates() {
  if (!app.isPackaged || isChecking || hasDownloadedUpdate) {
    return latestState;
  }

  isChecking = true;
  emitUpdateState({ status: "checking" });

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emitUpdateState({ status: "error", message: toErrorMessage(error) });
  } finally {
    isChecking = false;
  }

  return latestState;
}

export function installUpdate() {
  if (!hasDownloadedUpdate) {
    emitUpdateState({ status: "error", message: "No downloaded update is ready to install." });
    return latestState;
  }

  emitUpdateState({ status: "installing", message: "Restarting to install the update..." });
  autoUpdater.quitAndInstall(false, true);
  return latestState;
}

export function initializeUpdates() {
  if (!app.isPackaged) {
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.fullChangelog = true;

  autoUpdater.on("checking-for-update", () => {
    emitUpdateState({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    availableUpdate = toUpdateInfo(info);
    hasDownloadedUpdate = false;
    emitUpdateState({ status: "available" });
    void autoUpdater.downloadUpdate();
  });

  autoUpdater.on("update-not-available", () => {
    availableUpdate = null;
    hasDownloadedUpdate = false;
    autoInstallOnDownload = false;
    emitUpdateState({ status: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitUpdateState({ status: "downloading", progress: Math.round(progress.percent || 0) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    availableUpdate = toUpdateInfo(info);
    hasDownloadedUpdate = true;
    emitUpdateState({ status: "downloaded" });

    if (autoInstallOnDownload) {
      autoInstallOnDownload = false;
      installUpdate();
    }
  });

  autoUpdater.on("error", (error) => {
    autoInstallOnDownload = false;
    isChecking = false;
    emitUpdateState({ status: "error", message: toErrorMessage(error) });
  });

  void checkForUpdates();
}

export function scheduleUpdateChecks({ intervalMs = UPDATE_CHECK_INTERVAL_MS } = {}) {
  if (!app.isPackaged || recurringCheckInterval) {
    return;
  }

  recurringCheckInterval = setInterval(() => {
    void checkForUpdates();
  }, intervalMs);
  recurringCheckInterval.unref?.();
}