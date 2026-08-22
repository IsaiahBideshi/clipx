import { app, BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import semver from "semver";

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const VERSION_POLL_INTERVAL_MS = 20 * 1000;
const VERSION_POLL_TIMEOUT_MS = 5000;
const POLL_SKIP_STATUSES = new Set(["available", "downloading", "downloaded", "installing", "error"]);

let latestState = { status: "idle", currentVersion: app.getVersion() };
let availableUpdate = null;
let isChecking = false;
let hasDownloadedUpdate = false;
let recurringCheckInterval = null;
let versionPollInterval = null;
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

export function checkForUpdatesAndInstall({ checkTimeoutMs = 10000, downloadTimeoutMs = 10 * 60 * 1000 } = {}) {
  if (!app.isPackaged || isChecking || hasDownloadedUpdate) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let downloadStarted = false;
    let settled = false;

    const settle = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const checkTimer = setTimeout(() => {
      if (!downloadStarted) {
        emitUpdateState({ status: "error", message: "Update check timed out." });
        settle(false);
      }
    }, checkTimeoutMs);

    const downloadTimer = setTimeout(() => {
      if (downloadStarted) {
        emitUpdateState({ status: "error", message: "Update download timed out." });
        settle(false);
      }
    }, downloadTimeoutMs);

    const onAvailable = () => {
      downloadStarted = true;
      clearTimeout(checkTimer);
    };

    const onDownloaded = (info) => {
      availableUpdate = toUpdateInfo(info);
      hasDownloadedUpdate = true;
      emitUpdateState({ status: "downloaded" });
      settle(true);
      autoUpdater.quitAndInstall(false, true);
    };

    const onError = (error) => {
      emitUpdateState({ status: "error", message: toErrorMessage(error) });
      settle(false);
    };

    const onNotAvailable = () => {
      emitUpdateState({ status: "not-available" });
      settle(false);
    };

    function cleanup() {
      clearTimeout(checkTimer);
      clearTimeout(downloadTimer);
      autoUpdater.removeListener("update-available", onAvailable);
      autoUpdater.removeListener("update-downloaded", onDownloaded);
      autoUpdater.removeListener("error", onError);
      autoUpdater.removeListener("update-not-available", onNotAvailable);
    }

    autoUpdater.on("update-available", onAvailable);
    autoUpdater.on("update-downloaded", onDownloaded);
    autoUpdater.on("error", onError);
    autoUpdater.on("update-not-available", onNotAvailable);

    void checkForUpdates();
  });
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
    emitUpdateState({ status: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitUpdateState({ status: "downloading", progress: Math.round(progress.percent || 0) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    availableUpdate = toUpdateInfo(info);
    hasDownloadedUpdate = true;
    emitUpdateState({ status: "downloaded" });
  });

  autoUpdater.on("error", (error) => {
    isChecking = false;
    emitUpdateState({ status: "error", message: toErrorMessage(error) });
  });
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

function getApiBaseUrl() {
  return (process.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");
}

async function pollLatestVersion() {
  if (!app.isPackaged || isChecking || hasDownloadedUpdate || POLL_SKIP_STATUSES.has(latestState.status)) {
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERSION_POLL_TIMEOUT_MS);


  try {
    const response = await fetch(`${getApiBaseUrl()}/api/latest-version`, { signal: controller.signal });
    if (!response.ok) {
      return;
    }

    const body = await response.json();
    const remoteVersion = body?.data?.version;
    if (!remoteVersion) {
      return;
    }

    if (semver.gt(remoteVersion, app.getVersion())) {
      void checkForUpdates();
    }
  } catch {
    // Silent — the next poll will retry.
  } finally {
    clearTimeout(timer);
  }
}

export function startVersionPolling({ intervalMs = VERSION_POLL_INTERVAL_MS } = {}) {
  if (!app.isPackaged || versionPollInterval) {
    return;
  }

  versionPollInterval = setInterval(() => {
    void pollLatestVersion();
  }, intervalMs);
  versionPollInterval.unref?.();

  void pollLatestVersion();
}