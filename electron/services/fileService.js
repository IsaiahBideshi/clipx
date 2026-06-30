import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { app } from "electron";

import { getFastFileId } from "../utils/hashing.js";
import { getMimeType } from "../utils/mime.js";
import { resolveFfmpegPath } from "../utils/ffmpeg.js";
import { isSupportedVideoFile } from "../utils/videoFiles.js";
import { getCachedThumbnailPath, setCachedThumbnailPath } from "./clipIndexService.js";

ffmpeg.setFfmpegPath(resolveFfmpegPath(ffmpegPath));

const THUMBNAIL_CONCURRENCY = 2;
const thumbnailQueue = [];
const inFlightThumbnails = new Map();
let activeThumbnailJobs = 0;

function runThumbnailQueue() {
  while (activeThumbnailJobs < THUMBNAIL_CONCURRENCY && thumbnailQueue.length > 0) {
    const item = thumbnailQueue.shift();
    activeThumbnailJobs += 1;

    Promise.resolve()
      .then(item.job)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeThumbnailJobs -= 1;
        runThumbnailQueue();
      });
  }
}

function enqueueThumbnailJob(key, job) {
  if (inFlightThumbnails.has(key)) {
    return inFlightThumbnails.get(key);
  }

  const promise = new Promise((resolve, reject) => {
    thumbnailQueue.push({ job, resolve, reject });
    runThumbnailQueue();
  }).finally(() => {
    inFlightThumbnails.delete(key);
  });

  inFlightThumbnails.set(key, promise);
  return promise;
}

export function registerClipxProtocol(protocol) {
  protocol.handle("clipx", async (request) => {
    const requestUrl = new URL(request.url);
    const filePath = decodeURIComponent(requestUrl.searchParams.get("path") || "");
    const host = requestUrl.host;

    if (!filePath) {
      return new Response("Missing path", { status: 400 });
    }

    const fileStat = fs.statSync(filePath);
    const range = request.headers.get("range");
    let start = 0;
    let end = fileStat.size - 1;

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        start = match[1] ? parseInt(match[1], 10) : start;
        end = match[2] ? parseInt(match[2], 10) : end;
      }
    }

if (host === "video") {
  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });

  stream.on('error', (err) => {
    console.error('Stream error:', err);
    stream.destroy();
  });

  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy(); // clean destroy on seek/cancel
    }
  });

  return new Response(webStream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": getMimeType(filePath),
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunkSize),
    },
  });
}

    if (host === "image") {
      return new Response(fs.createReadStream(filePath), {
        headers: {
          "Content-Type": getMimeType(filePath),
        },
      });
    }

    return new Response("Unknown clipx route", { status: 404 });
  });
}

export async function scanFolder(folderPath) {
  try {
    const clips = [];
    const pendingDirs = [folderPath];

    while (pendingDirs.length > 0) {
      const currentDir = pendingDirs.pop();

      if (!fs.existsSync(currentDir)) {
        console.warn("ClipX: Directory does not exist", currentDir);
        continue;
      }

      let entries = [];

      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (error) {
        console.error("ClipX: Failed to read directory", currentDir, error);
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (currentDir.toLowerCase().includes("thumbs") || currentDir.toLowerCase().includes("clipx videos")) {
            continue;
          }
          pendingDirs.push(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        if (!isSupportedVideoFile(entry.name)) {
          continue;
        }

        let stats;
        try {
          stats = await fs.promises.stat(fullPath);
        } catch (error) {
          console.error("ClipX: Failed to stat file", fullPath, error);
          continue;
        }

        let id;
        try {
          id = await getFastFileId(fullPath, stats);
        } catch (error) {
          console.error("ClipX: Failed to get file ID for", fullPath, error);
          continue;
        }

        clips.push({
          id,
          name: entry.name,
          path: fullPath,
          size: stats.size,
          createdAt: stats.birthtimeMs,
          modifiedAt: stats.mtimeMs,
        });
      }
    }

    clips.sort((a, b) => b.createdAt - a.createdAt);
    return clips;
  } catch (error) {
    console.error("ClipX: Scan error:", error);
    return [];
  }
}

export async function generateThumbnail(videoPath) {
  const cachedThumbPath = getCachedThumbnailPath(videoPath);
  if (cachedThumbPath) {
    return cachedThumbPath;
  }

  const clipx = path.join(app.getPath("appData"), "clipx");
  let thumbsDir;
  if (videoPath.toLowerCase().includes("clipx videos")) {
    thumbsDir = path.join(clipx, "saved clips thumbs");
  }
  else {
    thumbsDir = path.join(clipx, "thumbs");
  }
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const thumbPath = path.join(thumbsDir, `${baseName}.jpg`);

  if (fs.existsSync(thumbPath)) {
    setCachedThumbnailPath(videoPath, thumbPath);
    return thumbPath;
  }

  await fs.promises.mkdir(thumbsDir, { recursive: true });

  return enqueueThumbnailJob(videoPath, async () => {
    if (fs.existsSync(thumbPath)) {
      setCachedThumbnailPath(videoPath, thumbPath);
      return thumbPath;
    }

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ["1"],
          filename: `${baseName}.jpg`,
          folder: thumbsDir,
          size: "320x180",
        })
        .on("end", resolve)
        .on("error", reject);
    });

    setCachedThumbnailPath(videoPath, thumbPath);
    return thumbPath;
  });
}
