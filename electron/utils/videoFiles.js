import path from "path";

export const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".flv", ".wmv", ".webm"];

export function isSupportedVideoFile(filePath) {
  return VIDEO_EXTENSIONS.includes(path.extname(String(filePath || "")).toLowerCase());
}

export function isSkippableMediaDirectory(dirPath) {
  const name = path.basename(String(dirPath || "")).toLowerCase();
  return name === "thumbs" || name === "saved clips thumbs";
}
