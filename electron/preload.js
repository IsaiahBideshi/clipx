const { contextBridge, ipcRenderer } = require("electron");

console.log("preload.js loaded");

contextBridge.exposeInMainWorld("clipx", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  pickVideoFile: () => ipcRenderer.invoke("pick-video-file"),
  scanFolder: (folderPath) => ipcRenderer.invoke("scan-folder", folderPath),
  getThumbnail: (videoPath, thumbsDir) => ipcRenderer.invoke("get-thumbnail", videoPath, thumbsDir),
  getTaglist: () => ipcRenderer.invoke("get-taglist"),
  saveTaglist: (taglist) => ipcRenderer.invoke("save-taglist", taglist),
  searchGames: (query) => ipcRenderer.invoke("search-games", query),
  getOptions: () => ipcRenderer.invoke("get-options"),
  saveOptions: (options) => ipcRenderer.invoke("save-options", options),
  getLaunchAtStartup: () => ipcRenderer.invoke("get-launch-at-startup"),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke("set-launch-at-startup", enabled),
  saveClip: (clipInfo) => ipcRenderer.invoke("save-clip", clipInfo),
  uploadClip: (clipInfo) => ipcRenderer.invoke("upload-clip", clipInfo),
  linkYoutube: (userId) => ipcRenderer.invoke("link-youtube", userId),
  unlinkYoutube: (userId) => ipcRenderer.invoke("unlink-youtube", userId),
  getGoogleInfo: (userId) => ipcRenderer.invoke("get-google-info", userId),
  getClipData: (clipPath) => ipcRenderer.invoke("get-clip-data", clipPath),
  getGameData: (gameId) => ipcRenderer.invoke("get-game-data", gameId),
  signInWithGoogle: () => ipcRenderer.invoke("sign-in-with-google"),
  authStorageGet: (key) => ipcRenderer.invoke("auth-storage-get", key),
  authStorageSet: (key, value) => ipcRenderer.invoke("auth-storage-set", key, value),
  authStorageRemove: (key) => ipcRenderer.invoke("auth-storage-remove", key),
  getUpdateState: () => ipcRenderer.invoke("updates:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  cancelUpdateDownload: () => ipcRenderer.invoke("updates:cancel-download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateState: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, state) => {
      try {
        callback(state);
      } catch (error) {
        console.error("ClipX: Update state callback failed:", error);
      }
    };
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
});
