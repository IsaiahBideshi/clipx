import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { app } from "electron";
import { rename } from "fs/promises";

import { uploadClipToYoutube } from "./youtubeService.js";
import { resolveFfmpegPath } from "../utils/ffmpeg.js";
import { getIndexedClipData, setIndexedClipMetadata, markIndexedClipMissing, getWatchedRootForPath, upsertIndexedClip } from "./clipIndexService.js";
import { getSupabaseAccessToken } from "../ipc/authStorage.js";

ffmpeg.setFfmpegPath(resolveFfmpegPath(ffmpegPath));

export class ClipServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "ClipServiceError";
    this.statusCode = statusCode;
  }
}

const CLIPS_DATA_FILE = "clipsData.json";
const API_BASE = (process.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");
const AZURE_CLIPS_CONTAINER = "clips";
const AZURE_THUMBS_CONTAINER = "clip-thumbnails";

function stripVideoExtension(fileName) {
  return String(fileName || "").replace(/\.(mp4|webm|mov)$/i, "");
}

function buildClipOutputName(baseName) {
  const safeName = String(baseName || "Untitled Clip")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim();
  return `${safeName || "Untitled Clip"}.mp4`;
}

function buildThumbnailOutputName(baseName) {
  return buildClipOutputName(baseName).replace(/\.mp4$/, ".jpg");
}

async function renderClipSegment(videoPath, startTime, endTime, outputPath) {
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .output(outputPath)
      .outputOptions(["-c copy", "-movflags +faststart"])
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

async function renderClipThumbnail(videoPath, startTime, endTime, outputPath) {
  const clipDuration = endTime - startTime;
  const thumbTimestamp = clipDuration >= 1 ? startTime + 1 : startTime;

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [String(thumbTimestamp)],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "320x180",
      })
      .on("end", resolve)
      .on("error", reject);
  });
}

async function renderUpscaledClipSegment4K(videoPath, startTime, endTime, outputPath) {
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .videoFilters("scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos,pad=3840:2160:(ow-iw)/2:(oh-ih)/2")
      .outputOptions([
        "-c:v libx264",
        "-preset slow",
        "-profile:v high",
        "-level:v 5.1",
        "-crf 14",
        "-b:v 45M",
        "-maxrate 68M",
        "-bufsize 136M",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-c:a aac",
        "-b:a 320k",
      ])
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

async function getClipDataFromDir(clipDir) {
  const clipDataPath = path.join(app.getPath("appData"), CLIPS_DATA_FILE);
  try {
    const raw = await fs.promises.readFile(clipDataPath, "utf-8");
    if (!raw.trim()) {
      return { clips: [] };
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.clips)) {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      return { clips: parsed };
    }

    return { clips: [] };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      await fs.promises.mkdir(clipDir, { recursive: true });
      const initialData = { clips: [] };
      await fs.promises.writeFile(clipDataPath, JSON.stringify(initialData, null, 2), "utf-8");
      return initialData;
    }

    console.error("ClipX: Failed to read clipsData.json:", error);
    return { clips: [] };
  }
}

async function saveClipData(clipDir, clipEntry) {
  const clipDataPath = path.join(app.getPath("appData"), CLIPS_DATA_FILE);
  const clipsData = await getClipDataFromDir(clipDir);

  if (!Array.isArray(clipsData.clips)) {
    clipsData.clips = [];
  }

  const index = clipsData.clips.findIndex((item) => item.path === clipEntry.path);
  if (index >= 0) {
    clipsData.clips[index] = {
      ...clipsData.clips[index],
      ...clipEntry,
      updatedAt: Date.now(),
    };
  } else {
    clipsData.clips.push({
      ...clipEntry,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  await fs.promises.writeFile(clipDataPath, JSON.stringify(clipsData, null, 2), "utf-8");
  setIndexedClipMetadata(clipEntry.path, clipEntry);
}

export async function saveClip(options) {
  const clip = options.clip;
  const videoPath = clip.path;
  const startTime = options.start;
  const endTime = options.end;
  const clipTitle = options.title || `Untitled Clip ${Date.now()}`;
  const tags = options.tags || [];
  let game = options.game || null;
  if (options.game && typeof options.game === "object") {
    game.image = game.image.replace("t_thumb", "t_cover_big") || null;
  }

  if (!videoPath || typeof videoPath !== "string") {
    throw new TypeError("save-clip: videoPath must be a non-empty string");
  }
  if (typeof startTime !== "number" || typeof endTime !== "number" || startTime < 0 || endTime <= startTime) {
    throw new TypeError("save-clip: Invalid startTime or endTime");
  }

  const sourceDir = path.dirname(videoPath);
  const outputDir = path.join(sourceDir, "ClipX Videos");
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, buildClipOutputName(clipTitle));

  const fileExists = await fs.promises.access(outputPath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (fileExists) {
    throw new Error(`A clip named "${clipTitle}" already exists`);
  }

  await renderClipSegment(videoPath, startTime, endTime, outputPath);

  const stat = await fs.promises.stat(outputPath);
  if (!stat.size) {
    throw new Error("Output file is empty");
  }

  await saveClipData(outputDir, {
    path: outputPath,
    name: path.basename(outputPath),
    sourcePath: videoPath,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    startTime,
    endTime,
    duration: endTime - startTime,
    tags,
    game: game ? game : null,
  });

  const root = getWatchedRootForPath(outputPath) || sourceDir;
  await upsertIndexedClip(root, outputPath, { emitChange: true });

  return 200;
}

export async function uploadClip(app, options) {
  const clip = options?.clip;
  const videoPath = clip?.path;
  const startTime = options?.start;
  const endTime = options?.end;
  const clipTitle = options?.title || stripVideoExtension(clip?.name) || `Untitled Clip ${Date.now()}`;
  const tags = options?.tags || [];
  const game = options?.game || null;
  const userId = options?.userId || null;

  if (!videoPath || typeof videoPath !== "string") {
    throw new TypeError("upload-clip: videoPath must be a non-empty string");
  }
  if (typeof startTime !== "number" || typeof endTime !== "number" || startTime < 0 || endTime <= startTime) {
    throw new TypeError("upload-clip: Invalid startTime or endTime");
  }

  const tempDir = path.join(app.getPath("temp"), "clipx", "uploads");
  await fs.promises.mkdir(tempDir, { recursive: true });
  const tempStamp = Date.now();
  const tempPath = path.join(tempDir, `${tempStamp}-${buildClipOutputName(clipTitle)}`);
  const tempThumbPath = path.join(tempDir, `${tempStamp}-${buildThumbnailOutputName(clipTitle)}`);

  try {
    await renderClipSegment(videoPath, startTime, endTime, tempPath);

    let thumbnailPath = null;
    try {
      await renderClipThumbnail(videoPath, startTime, endTime, tempThumbPath);
      thumbnailPath = tempThumbPath;
    } catch (thumbnailError) {
      console.error("ClipX: Failed to render thumbnail:", thumbnailError);
    }

    const result = await uploadClipToAzureBlobStorage({
      videoPath: tempPath,
      thumbnailPath,
      title: clipTitle,
      userId,
    });
    return { status: 200, ...result };

  } finally {
    for (const filePath of [tempPath, tempThumbPath]) {
      try {
        await fs.promises.unlink(filePath);
      } catch (_error) {
      }
    }
  }
}

async function uploadBlobToAzure({ token, name, contentType, filePath, container = AZURE_CLIPS_CONTAINER }) {
  const sasRes = await fetch(`${API_BASE}/api/clips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, contentType, container }),
  });

  if (!sasRes.ok) {
    const err = await sasRes.json().catch(() => null);
    throw new Error(err?.error || `Failed to get upload URL (${sasRes.status})`);
  }

  const { data } = await sasRes.json();
  const fileBuffer = await fs.promises.readFile(filePath);

  const uploadRes = await fetch(data.url, {
    method: "PUT",
    headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": contentType },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Azure upload failed (${uploadRes.status})`);
  }
}

async function uploadClipToAzureBlobStorage({ videoPath, thumbnailPath, title, userId }) {
  const token = await getSupabaseAccessToken();
  if (!token || !userId) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const blobPrefix = `${userId}/`;
  const videoBlobName = `${blobPrefix}${randomUUID()}-${buildClipOutputName(title)}`;

  await uploadBlobToAzure({
    token,
    name: videoBlobName,
    contentType: "video/mp4",
    filePath: videoPath,
  });

  let thumbnailBlobName = null;
  if (thumbnailPath) {
    try {
      thumbnailBlobName = `${blobPrefix}${randomUUID()}-${buildThumbnailOutputName(title)}`;
      await uploadBlobToAzure({
        token,
        name: thumbnailBlobName,
        contentType: "image/jpeg",
        filePath: thumbnailPath,
        container: AZURE_THUMBS_CONTAINER,
      });
    } catch (thumbnailError) {
      console.error("ClipX: Failed to upload thumbnail:", thumbnailError);
      try {
        await uploadClipToBlobStorageDelete({ token, name: thumbnailBlobName, container: AZURE_THUMBS_CONTAINER });
      } catch (cleanupError) {
        console.error("ClipX: Failed to clean up thumbnail blob after upload failure:", cleanupError);
      }
      thumbnailBlobName = null;
    }
  }

  return { blobName: videoBlobName, thumbnailBlobName };
}

async function uploadClipToBlobStorageDelete({ token, name, container }) {
  const res = await fetch(`${API_BASE}/api/clips`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, container }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Failed to delete blob (${res.status})`);
  }
}

export async function deleteClipBlob({ blobName, thumbnailBlobName }) {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const names = [];
  if (blobName) {
    names.push({ name: blobName, container: AZURE_CLIPS_CONTAINER });
  }
  if (thumbnailBlobName) {
    names.push({ name: thumbnailBlobName, container: AZURE_THUMBS_CONTAINER });
  }

  if (names.length === 0) {
    return;
  }

  for (const { name, container } of names) {
    await uploadClipToBlobStorageDelete({ token, name, container });
  }
}

export async function getClipData(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("get-clip-data: clipPath must be a non-empty string");
  }

  const indexedClipData = getIndexedClipData(clipPath);
  if (indexedClipData) {
    return indexedClipData;
  }

  const clipDir = path.dirname(clipPath);
  const clipsData = await getClipDataFromDir(clipDir);
  const clipEntry = clipsData.clips.find((item) => item.path === clipPath);
  return clipEntry || null;
}

export async function renameClip(clipPath, newName) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("rename-clip: clipPath must be a non-empty string");
  }
  if (typeof newName !== "string" || newName.trim().length === 0) {
    throw new TypeError("rename-clip: newName must be a non-empty string");
  }

  const ext = path.extname(clipPath);
  if (!ext) {
    throw new Error("rename-clip: clipPath must have a valid file extension");
  }

  const trimmedName = newName.trim();
  const baseName = trimmedName.toLowerCase().endsWith(ext.toLowerCase())
    ? trimmedName.slice(0, -ext.length).trim()
    : trimmedName;

  if (
    !baseName ||
    baseName === "." ||
    baseName === ".." ||
    /[<>:"/\\|?*\x00-\x1F]/.test(baseName) ||
    /[. ]$/.test(baseName) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName)
  ) {
    throw new Error("rename-clip: newName contains invalid filename characters");
  }

  const clipDir = path.dirname(clipPath);
  const newClipPath = path.join(clipDir, baseName + ext);

  if (newClipPath !== clipPath && fs.existsSync(newClipPath)) {
    throw new ClipServiceError(`A clip named "${baseName + ext}" already exists`, 409);
  }

  try {
    await rename(clipPath, newClipPath);
    
    const root = getWatchedRootForPath(newClipPath) || clipDir;
    markIndexedClipMissing(clipPath, { emitChange: true });
    await upsertIndexedClip(root, newClipPath, { emitChange: true });

    return { path: newClipPath, name: path.basename(newClipPath) };
  } catch (error) {
    console.error(`Failed to rename clip from ${clipPath} to ${newClipPath}:`, error);
    throw new ClipServiceError(`Failed to rename clip: ${error.message}`, 500);
  }
}

export async function deleteClip(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("delete-clip: clipPath must be a non-empty string");
  }

  try {
    await fs.promises.unlink(clipPath);
    const clipDir = path.dirname(clipPath);
    markIndexedClipMissing(clipPath, { emitChange: true });
    const clipsData = await getClipDataFromDir(clipDir);
    const updatedClips = clipsData.clips.filter((item) => item.path !== clipPath);
    await fs.promises.writeFile(path.join(app.getPath("appData"), CLIPS_DATA_FILE), JSON.stringify({ clips: updatedClips }, null, 2), "utf-8");
  } catch (error) {
    console.error(`Failed to delete clip at ${clipPath}:`, error);
    throw new Error(`Failed to delete clip: ${error.message}`);
  }

}
