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
  saveClip: (clipInfo) => ipcRenderer.invoke("save-clip", clipInfo),
  uploadClip: (clipInfo) => ipcRenderer.invoke("upload-clip", clipInfo),
  linkYoutube: (userId) => ipcRenderer.invoke("link-youtube", userId),
  unlinkYoutube: (userId) => ipcRenderer.invoke("unlink-youtube", userId),
  getGoogleInfo: (userId) => ipcRenderer.invoke("get-google-info", userId),
  getClipData: (clipPath) => ipcRenderer.invoke("get-clip-data", clipPath),
  getGameData: (gameId) => ipcRenderer.invoke("get-game-data", gameId),
  signInWithGoogle: () => ipcRenderer.invoke("sign-in-with-google"),
  getUpdateState: () => ipcRenderer.invoke("updates:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
});
