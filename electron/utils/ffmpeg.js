import fs from "fs";
import { app } from "electron";

export function resolveFfmpegPath(ffmpegPath) {
  if (!ffmpegPath) {
    return null;
  }

  if (!app.isPackaged) {
    return ffmpegPath;
  }

  const unpackedPath = ffmpegPath.replace(/app\.asar([\\/])/g, "app.asar.unpacked$1");
  return fs.existsSync(unpackedPath) ? unpackedPath : ffmpegPath;
}