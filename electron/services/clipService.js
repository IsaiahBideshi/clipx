import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { app } from "electron";
import { rename } from "fs/promises";

import { resolveFfmpegPath } from "../utils/ffmpeg.js";
import { STREAM_COPY_BITRATE, buildStreamBlobName, renderStreamCopy } from "../utils/streamCopy.js";
import { getIndexedClipData, setIndexedClipMetadata, markIndexedClipMissing, getWatchedRootForPath, upsertIndexedClip, getCachedThumbnailPath, getClipGroup, moveSavedClipOriginal, isIndexedClipNew } from "./clipIndexService.js";
import { CLIP_MANIFEST_NAME, getManifestFile, keepManifestFile, removeManifestFile, renameManifestFile } from "../utils/clipManifest.js";
import { buildAudioOutputOptions } from "../utils/audioMix.js";
import { copyScreenAudio } from "../utils/screenAudio.js";
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
const UPLOAD_BLOCK_BYTES = 8 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 8;

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

function getScreenSource(clipPath, screen) {
  if (!screen) {
    return null;
  }

  const file = getClipGroup(clipPath)?.files.find((entry) => entry.path === screen.path && entry.role === "secondary");
  if (!file) {
    throw new ClipServiceError("That screen is no longer part of this clip.", 404);
  }

  const shift = Number(screen.shift);
  return { videoPath: file.path, audioPath: clipPath, shift: Number.isFinite(shift) ? shift : 0 };
}

async function renderClipSegment(videoPath, startTime, endTime, outputPath, mix = null, screen = null) {
  await new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath).setStartTime(startTime);
    if (screen) {
      const audioStart = startTime + screen.shift;
      command.input(screen.audioPath);
      if (audioStart >= 0) {
        command.seekInput(audioStart);
      } else {
        command.inputOptions(["-itsoffset", String(-audioStart)]);
      }
    }
    command
      .setDuration(endTime - startTime)
      .output(outputPath)
      .outputOptions([...buildAudioOutputOptions(mix, screen ? 1 : 0), "-movflags +faststart"])
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
    game.image = game.image?.replace("t_thumb", "t_cover_big") || null;
  }

  if (!videoPath || typeof videoPath !== "string") {
    throw new TypeError("save-clip: videoPath must be a non-empty string");
  }
  if (typeof startTime !== "number" || typeof endTime !== "number" || startTime < 0 || endTime <= startTime) {
    throw new TypeError("save-clip: Invalid startTime or endTime");
  }

  const screen = getScreenSource(videoPath, options.screen);
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

  await renderClipSegment(screen?.videoPath || videoPath, startTime, endTime, outputPath, options.mix, screen);

  const stat = await fs.promises.stat(outputPath);
  if (!stat.size) {
    throw new Error("Output file is empty");
  }

  await saveClipData(outputDir, {
    path: outputPath,
    name: path.basename(outputPath),
    sourcePath: screen?.videoPath || videoPath,
    originalPath: videoPath,
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
  const tempStreamPath = path.join(tempDir, `${tempStamp}-stream-${buildClipOutputName(clipTitle)}`);

  const renders = [];
  try {
    const startedAt = Date.now();
    const screen = getScreenSource(videoPath, options.screen);
    await renderClipSegment(screen?.videoPath || videoPath, startTime, endTime, tempPath, options.mix, screen);

    const { size } = await fs.promises.stat(tempPath);
    const streamRender = (size * 8) / (endTime - startTime) > STREAM_COPY_BITRATE * 1.25
      ? renderStreamCopy(tempPath, tempStreamPath).then(() => tempStreamPath, (streamError) => {
        console.error("ClipX: Failed to render stream copy:", streamError);
        return null;
      })
      : Promise.resolve(null);
    const thumbnailRender = renderClipThumbnail(screen?.videoPath || videoPath, startTime, endTime, tempThumbPath)
      .then(() => tempThumbPath, (thumbnailError) => {
        console.error("ClipX: Failed to render thumbnail:", thumbnailError);
        return null;
      });
    renders.push(streamRender, thumbnailRender);

    const result = await uploadClipToAzureBlobStorage({
      videoPath: tempPath,
      streamRender,
      thumbnailRender,
      title: clipTitle,
      userId,
    });
    console.info(`ClipX: Uploaded a clip in ${Date.now() - startedAt} ms (${Math.round(size / 1e6)} MB).`);
    return { status: 200, ...result };

  } finally {
    void Promise.all(renders).then(async () => {
      for (const filePath of [tempPath, tempThumbPath, tempStreamPath]) {
        try {
          await fs.promises.unlink(filePath);
        } catch (_error) {
        }
      }
    });
  }
}

async function requireAccessToken() {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error("Not authenticated. Please log in first.");
  }
  return token;
}

async function uploadBlobToAzure({ name, contentType, filePath, container = AZURE_CLIPS_CONTAINER }) {
  const sasRes = await fetch(`${API_BASE}/api/clips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await requireAccessToken()}`,
    },
    body: JSON.stringify({ name, contentType, container }),
  });

  if (!sasRes.ok) {
    const err = await sasRes.json().catch(() => null);
    throw new Error(err?.error || `Failed to get upload URL (${sasRes.status})`);
  }

  const { data } = await sasRes.json();
  const { BlockBlobClient } = await import("@azure/storage-blob");
  try {
    await new BlockBlobClient(data.url).uploadFile(filePath, {
      blobHTTPHeaders: { blobContentType: contentType },
      blockSize: UPLOAD_BLOCK_BYTES,
      maxSingleShotSize: UPLOAD_BLOCK_BYTES,
      concurrency: UPLOAD_CONCURRENCY,
    });
  } catch (error) {
    console.error("ClipX: Azure upload failed:", error);
    throw new Error(`Azure upload failed (${error?.statusCode || error?.code || "network error"})`);
  }
}

async function uploadClipToAzureBlobStorage({ videoPath, streamRender, thumbnailRender, title, userId }) {
  await requireAccessToken();
  if (!userId) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const blobPrefix = `${userId}/`;
  const videoBlobName = `${blobPrefix}${randomUUID()}-${buildClipOutputName(title)}`;

  await uploadBlobToAzure({
    name: videoBlobName,
    contentType: "video/mp4",
    filePath: videoPath,
  });

  const streamPath = await streamRender;
  if (streamPath) {
    try {
      await uploadBlobToAzure({
        name: buildStreamBlobName(videoBlobName),
        contentType: "video/mp4",
        filePath: streamPath,
      });
    } catch (streamError) {
      console.error("ClipX: Failed to upload stream copy:", streamError);
    }
  }

  let thumbnailBlobName = null;
  const thumbnailPath = await thumbnailRender;
  if (thumbnailPath) {
    try {
      thumbnailBlobName = `${blobPrefix}${randomUUID()}-${buildThumbnailOutputName(title)}`;
      await uploadBlobToAzure({
        name: thumbnailBlobName,
        contentType: "image/jpeg",
        filePath: thumbnailPath,
        container: AZURE_THUMBS_CONTAINER,
      });
    } catch (thumbnailError) {
      console.error("ClipX: Failed to upload thumbnail:", thumbnailError);
      try {
        await uploadClipToBlobStorageDelete({ name: thumbnailBlobName, container: AZURE_THUMBS_CONTAINER });
      } catch (cleanupError) {
        console.error("ClipX: Failed to clean up thumbnail blob after upload failure:", cleanupError);
      }
      thumbnailBlobName = null;
    }
  }

  return { blobName: videoBlobName, thumbnailBlobName };
}

async function uploadClipToBlobStorageDelete({ name, container }) {
  const res = await fetch(`${API_BASE}/api/clips`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await requireAccessToken()}`,
    },
    body: JSON.stringify({ name, container }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Failed to delete blob (${res.status})`);
  }
}

export async function deleteClipBlob({ blobName, thumbnailBlobName }) {
  await requireAccessToken();

  const names = [];
  if (blobName) {
    names.push({ name: blobName, container: AZURE_CLIPS_CONTAINER });
    names.push({ name: buildStreamBlobName(blobName), container: AZURE_CLIPS_CONTAINER });
  }
  if (thumbnailBlobName) {
    names.push({ name: thumbnailBlobName, container: AZURE_THUMBS_CONTAINER });
  }

  if (names.length === 0) {
    return;
  }

  for (const { name, container } of names) {
    await uploadClipToBlobStorageDelete({ name, container });
  }
}

const TRACK_CACHE_BYTES = 500 * 1024 * 1024;

let tracksJob = Promise.resolve();
let runningTracks = null;
let openClipPath = null;

function queueTracksJob(clipPath, job) {
  const result = tracksJob.then(() => {
    const running = { clipPath, done: job() };
    runningTracks = running;
    return running.done.finally(() => {
      if (runningTracks === running) {
        runningTracks = null;
      }
    });
  });
  tracksJob = result.catch(() => {});
  return result;
}

async function waitForTracksJob(clipPath) {
  if (runningTracks && path.resolve(runningTracks.clipPath).toLowerCase() === path.resolve(clipPath).toLowerCase()) {
    await runningTracks.done.catch(() => {});
  }
}

function getTracksDir() {
  return path.join(app.getPath("temp"), "clipx", "tracks");
}

async function getTracksOutputDir(clipPath) {
  const stat = await fs.promises.stat(clipPath);
  const key = createHash("sha1").update(`${clipPath}|${stat.size}|${stat.mtimeMs}`).digest("hex").slice(0, 16);
  return path.join(getTracksDir(), key);
}

async function findTracks(clipPath) {
  const group = getClipGroup(clipPath);
  const tracks = getManifestFile(group?.manifest, path.basename(clipPath))?.audioTracks || [];
  if (!tracks.length) {
    return { tracks, outputDir: null, outputs: [], cached: true };
  }

  const outputDir = await getTracksOutputDir(clipPath);
  const outputs = tracks.map((track) => ({ index: track.index, path: path.join(outputDir, `${track.index}.m4a`) }));
  const cached = outputs.every((output) => fs.existsSync(output.path));
  if (cached) {
    const now = new Date();
    await fs.promises.utimes(outputDir, now, now).catch(() => {});
  }
  return { tracks, outputDir, outputs, cached };
}

export async function getCachedClipTracks(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("get-cached-clip-tracks: clipPath must be a non-empty string");
  }

  openClipPath = clipPath;
  const { outputs, cached } = await findTracks(clipPath);
  return cached ? outputs : null;
}

export async function extractClipTracks(clipPath, { background = false } = {}) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("extract-clip-tracks: clipPath must be a non-empty string");
  }

  if (!background) {
    openClipPath = clipPath;
  }
  return queueTracksJob(clipPath, () => extractTracks(clipPath, background));
}

async function extractTracks(clipPath, background) {
  const { tracks, outputDir, outputs, cached } = await findTracks(clipPath);
  if (cached) {
    return outputs;
  }

  const partDir = `${outputDir}.part`;
  await fs.promises.rm(partDir, { recursive: true, force: true });
  await fs.promises.mkdir(partDir, { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      const command = ffmpeg(clipPath);
      for (const track of tracks) {
        command.output(path.join(partDir, `${track.index}.m4a`)).outputOptions(["-map", `0:a:${track.index - 1}`, "-c", "copy"]);
      }
      if (background) {
        command.on("start", () => {
          try {
            os.setPriority(command.ffmpegProc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
          } catch {}
        });
      }
      command.on("end", resolve).on("error", reject).run();
    });
    await fs.promises.rm(outputDir, { recursive: true, force: true });
    await renameWithRetry(partDir, outputDir);
  } catch (error) {
    await fs.promises.rm(partDir, { recursive: true, force: true });
    throw error;
  }

  await pruneTracksCache(path.dirname(outputDir)).catch((error) => console.error("ClipX: Failed to prune the audio track cache:", error));
  return outputs;
}

async function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fs.promises.rename(from, to);
    } catch (error) {
      if (attempt === 10 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function getDirSize(dirPath) {
  const names = await fs.promises.readdir(dirPath);
  const stats = await Promise.all(names.map((name) => fs.promises.stat(path.join(dirPath, name))));
  return stats.reduce((total, stat) => total + stat.size, 0);
}

async function pruneTracksCache(tracksDir) {
  const entries = await fs.promises.readdir(tracksDir, { withFileTypes: true });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const dirPath = path.join(tracksDir, entry.name);
        const stat = await fs.promises.stat(dirPath);
        return { dirPath, mtimeMs: stat.mtimeMs, size: await getDirSize(dirPath), partial: entry.name.endsWith(".part") };
      })
  );
  const openDir = openClipPath ? await getTracksOutputDir(openClipPath).catch(() => null) : null;
  const complete = dirs.filter((dir) => !dir.partial).sort((a, b) => b.mtimeMs - a.mtimeMs);
  let total = 0;
  const stale = complete.filter((dir, index) => {
    total += dir.size;
    return index > 0 && total > TRACK_CACHE_BYTES && dir.dirPath !== openDir;
  });
  for (const { dirPath } of [...dirs.filter((dir) => dir.partial), ...stale]) {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
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

async function updateClipManifest(clipDir, update) {
  const manifestPath = path.join(clipDir, CLIP_MANIFEST_NAME);
  let manifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf-8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("ClipX: Failed to read clip manifest:", error);
    }
    return;
  }

  const updated = update(manifest);
  if (updated) {
    await fs.promises.writeFile(manifestPath, JSON.stringify(updated, null, 2), "utf-8");
  }
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

  const thumbPath = getCachedThumbnailPath(clipPath) || getThumbnailPath(clipPath);
  const savedData = getIndexedClipData(clipPath);
  const isNew = isIndexedClipNew(clipPath);

  try {
    await waitForTracksJob(clipPath);
    await rename(clipPath, newClipPath);
    await rename(thumbPath, getThumbnailPath(newClipPath)).catch((error) => {
      if (error.code !== "ENOENT") {
        console.error(`Failed to rename thumbnail at ${thumbPath}:`, error);
      }
    });
    await updateClipManifest(clipDir, (manifest) => renameManifestFile(manifest, path.basename(clipPath), path.basename(newClipPath)))
      .catch((error) => console.error("ClipX: Failed to update clip manifest after rename:", error));

    const root = getWatchedRootForPath(newClipPath) || clipDir;
    moveSavedClipOriginal(clipPath, newClipPath);
    await upsertIndexedClip(root, newClipPath, {
      emitChange: true,
      isNew,
      savedMetadata: savedData ? { ...savedData, path: newClipPath, name: path.basename(newClipPath) } : null,
    });
    if (newClipPath !== clipPath) {
      markIndexedClipMissing(clipPath, { emitChange: true });
    }

    return { path: newClipPath, name: path.basename(newClipPath) };
  } catch (error) {
    console.error(`Failed to rename clip from ${clipPath} to ${newClipPath}:`, error);
    throw new ClipServiceError(`Failed to rename clip: ${error.message}`, 500);
  }
}

async function removeClipManifest(dirPath) {
  await fs.promises.rm(path.join(dirPath, CLIP_MANIFEST_NAME), { force: true });
  await fs.promises.rmdir(dirPath).catch(() => {});
}

export async function deleteClip(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("delete-clip: clipPath must be a non-empty string");
  }

  const group = getClipGroup(clipPath);
  const entry = getManifestFile(group?.manifest, path.basename(clipPath));
  if (entry?.role === "primary" && group.files.length > 1) {
    throw new Error("Failed to delete clip: the other screens use this file's audio, so delete all screens instead.");
  }

  await deleteClipFile(clipPath);
  if (entry?.role === "secondary") {
    await updateClipManifest(group.path, (manifest) => removeManifestFile(manifest, entry.file));
  } else if (entry) {
    await removeClipManifest(group.path);
  }
}

export async function deleteClipGroup(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("delete-clip-group: clipPath must be a non-empty string");
  }

  const group = getClipGroup(clipPath);
  if (!group) {
    return deleteClip(clipPath);
  }

  for (const file of group.files) {
    await deleteClipFile(file.path);
  }
  await removeClipManifest(group.path);
}

export async function keepClipScreen(clipPath, screen) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("keep-clip-screen: clipPath must be a non-empty string");
  }

  const group = getClipGroup(clipPath);
  const primary = group?.files.find((file) => file.path === clipPath && file.role === "primary");
  if (!primary) {
    throw new ClipServiceError("This clip has no other screens.", 404);
  }

  const source = getScreenSource(clipPath, screen);
  let keptPath = primary.path;
  let keptFile = primary.file;
  if (source) {
    keptFile = group.files.find((file) => file.path === source.videoPath).file;
    keptPath = path.join(group.path, `${stripVideoExtension(primary.file)} (${stripVideoExtension(keptFile)}).mp4`);
    if (fs.existsSync(keptPath)) {
      throw new ClipServiceError(`A clip named "${path.basename(keptPath)}" already exists`, 409);
    }

    try {
      await copyScreenAudio(source.videoPath, primary.path, keptPath);
    } catch (error) {
      await fs.promises.rm(keptPath, { force: true });
      throw error;
    }
  }

  const keptName = path.basename(keptPath);
  const others = group.files.filter((file) => file.path !== keptPath);
  try {
    const manifest = keepManifestFile(group.manifest, keptFile, keptName, others.map((file) => file.file));
    await fs.promises.writeFile(path.join(group.path, CLIP_MANIFEST_NAME), JSON.stringify(manifest, null, 2), "utf-8");
  } catch (error) {
    if (source) {
      await fs.promises.rm(keptPath, { force: true });
    }
    throw error;
  }

  const left = [];
  for (const file of others) {
    await deleteClipFile(file.path).catch(() => left.push(file));
  }
  await updateClipManifest(group.path, (manifest) => keepManifestFile(manifest, keptName, keptName, left.map((file) => file.file)))
    .catch((error) => console.error("ClipX: Failed to update clip manifest after keeping a screen:", error));

  const root = getWatchedRootForPath(keptPath) || group.path;
  moveSavedClipOriginal(primary.path, keptPath);
  for (const file of left) {
    await upsertIndexedClip(root, file.path, { emitChange: true })
      .catch((error) => console.error("ClipX: Failed to index a screen that couldn't be deleted:", error));
  }
  return upsertIndexedClip(root, keptPath, { emitChange: true });
}

function getThumbnailPath(clipPath) {
  const thumbsDir = clipPath.toLowerCase().includes("clipx videos") ? "saved clips thumbs" : "thumbs";
  return path.join(app.getPath("appData"), "clipx", thumbsDir, `${path.basename(clipPath, path.extname(clipPath))}.jpg`);
}

async function deleteClipFile(clipPath) {
  try {
    const thumbnailPaths = [
      getCachedThumbnailPath(clipPath),
      getThumbnailPath(clipPath),
    ];

    await waitForTracksJob(clipPath);
    await fs.promises.unlink(clipPath);

    for (const thumbPath of thumbnailPaths) {
      if (!thumbPath) continue;
      try {
        await fs.promises.unlink(thumbPath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(`Failed to delete thumbnail at ${thumbPath}:`, error);
        }
      }
    }

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
