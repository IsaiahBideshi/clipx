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
});
