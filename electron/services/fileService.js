import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

import { getFastFileId } from "../utils/hashing.js";
import { getMimeType } from "../utils/mime.js";

ffmpeg.setFfmpegPath(ffmpegPath);

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".flv", ".wmv", ".webm"];

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
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const clips = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.includes(ext)) {
        continue;
      }

      const fullPath = path.join(folderPath, entry.name);
      const stats = await fs.promises.stat(fullPath);

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

    clips.sort((a, b) => b.createdAt - a.createdAt);
    return clips;
  } catch (error) {
    console.error("ClipX: Scan error:", error);
    return [];
  }
}

export async function generateThumbnail(videoPath, thumbsDir) {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const thumbPath = path.join(thumbsDir, `${baseName}.jpg`);

  if (fs.existsSync(thumbPath)) {
    return thumbPath;
  }

  await fs.promises.mkdir(thumbsDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["1"],
        filename: `${baseName}.jpg`,
        folder: thumbsDir,
        size: "320x180",
      })
      .on("end", () => resolve(thumbPath))
      .on("error", reject);
  });
}
