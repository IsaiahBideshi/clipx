import { app, BrowserWindow, dialog, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import builderUtilRuntime from "builder-util-runtime";

const { autoUpdater } = electronUpdater;
const { CancellationError, CancellationToken } = builderUtilRuntime;

let latestState = {
  status: "idle",
  currentVersion: app.getVersion(),
};
let availableUpdateInfo = null;
let currentDownloadCancellationToken = null;
let isChecking = false;
let hasAvailableUpdate = false;
let isDownloading = false;
let hasDownloadedUpdate = false;
let isInstalling = false;

function emitUpdateState(state) {
  latestState = {
    currentVersion: app.getVersion(),
    ...state,
  };

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("updates:state", latestState);
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

function isCancellationError(error) {
  return error instanceof CancellationError || error?.message === "cancelled";
}

function clearDownloadState() {
  if (currentDownloadCancellationToken) {
    currentDownloadCancellationToken.dispose();
    currentDownloadCancellationToken = null;
  }
  isDownloading = false;
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

  if (isInstalling || isDownloading) {
    return latestState;
  }

  isChecking = true;

  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      emitUpdateState({
        status: "disabled",
        message: "Update checks are not available in this environment.",
      });
    }
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
    emitUpdateState({
      ...latestState,
      status: "error",
      message: "No update is available to download.",
    });
    return latestState;
  }

  if (isDownloading || hasDownloadedUpdate) {
    return latestState;
  }

  isDownloading = true;
  currentDownloadCancellationToken = new CancellationToken();

  try {
    emitUpdateState({
      ...latestState,
      status: "downloading",
      progress: 0,
    });
    await autoUpdater.downloadUpdate(currentDownloadCancellationToken);
  } catch (error) {
    if (isCancellationError(error)) {
      if (latestState.status === "cancelling" || latestState.status === "downloading") {
        emitUpdateState({
          status: hasAvailableUpdate ? "available" : "cancelled",
          update: availableUpdateInfo,
          message: "Update download cancelled.",
        });
      }
      return latestState;
    }

    emitUpdateState({
      status: "error",
      update: availableUpdateInfo,
      message: toErrorMessage(error),
    });
  } finally {
    clearDownloadState();
  }

  return latestState;
}

function cancelDownload() {
  if (!isDownloading || !currentDownloadCancellationToken) {
    return latestState;
  }

  emitUpdateState({
    ...latestState,
    status: "cancelling",
    message: "Cancelling update download...",
  });
  currentDownloadCancellationToken.cancel();
  return latestState;
}

function installUpdate() {
  if (!hasDownloadedUpdate) {
    emitUpdateState({
      ...latestState,
      status: "error",
      message: "No downloaded update is ready to install.",
    });
    return latestState;
  }

  try {
    isInstalling = true;
    emitUpdateState({
      ...latestState,
      status: "installing",
      message: "Restarting to install the update...",
    });
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    isInstalling = false;
    emitUpdateState({
      status: "error",
      update: availableUpdateInfo,
      message: toErrorMessage(error),
    });
  }

  return latestState;
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
  autoUpdater.fullChangelog = true;

  autoUpdater.on("checking-for-update", () => {
    emitUpdateState({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    availableUpdateInfo = toUpdateInfo(info);
    hasAvailableUpdate = true;
    hasDownloadedUpdate = false;
    emitUpdateState({
      status: "available",
      update: availableUpdateInfo,
    });
  });

  autoUpdater.on("update-not-available", () => {
    availableUpdateInfo = null;
    hasAvailableUpdate = false;
    hasDownloadedUpdate = false;
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
    availableUpdateInfo = toUpdateInfo(info);
    clearDownloadState();
    hasDownloadedUpdate = true;
    emitUpdateState({
      status: "downloaded",
      update: availableUpdateInfo,
    });
  });

  autoUpdater.on("update-cancelled", () => {
    clearDownloadState();
    emitUpdateState({
      status: hasAvailableUpdate ? "available" : "cancelled",
      update: availableUpdateInfo,
      message: "Update download cancelled.",
    });
  });

  autoUpdater.on("error", (error) => {
    isChecking = false;
    isInstalling = false;
    clearDownloadState();
    emitUpdateState({
      status: "error",
      update: availableUpdateInfo,
      message: toErrorMessage(error),
    });
  });

  ipcMain.handle("updates:get-state", () => latestState);
  ipcMain.handle("updates:check", () => checkForUpdates());
  ipcMain.handle("updates:download", () => downloadUpdate());
  ipcMain.handle("updates:cancel-download", () => cancelDownload());
  ipcMain.handle("updates:install", () => installUpdate());
}

export function registerUpdateWindowGuards(window) {
  window.on("close", (event) => {
    if (event.defaultPrevented || event.clipxMinimizedToTray) {
      return;
    }

    if (!isDownloading || isInstalling) {
      return;
    }

    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["Keep downloading", "Quit"],
      defaultId: 0,
      cancelId: 0,
      title: "Update download in progress",
      message: "ClipX is downloading an update.",
      detail: "If you quit now, the download will be cancelled. You can download the update again next time.",
      noLink: true,
    });

    if (choice === 0) {
      event.preventDefault();
      return;
    }

    cancelDownload();
  });
}
