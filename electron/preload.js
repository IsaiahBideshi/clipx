const { contextBridge, ipcRenderer } = require("electron");

console.log("preload.js loaded");

contextBridge.exposeInMainWorld("clipx", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  pickVideoFile: () => ipcRenderer.invoke("pick-video-file"),
  scanFolder: (folderPath) => ipcRenderer.invoke("scan-folder", folderPath),
  getThumbnail: (videoPath, thumbsDir) => ipcRenderer.invoke("get-thumbnail", videoPath, thumbsDir),
});
