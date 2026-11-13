import fs from "fs";
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

  try {
    const screen = getScreenSource(videoPath, options.screen);
    await renderClipSegment(screen?.videoPath || videoPath, startTime, endTime, tempPath, options.mix, screen);

    let streamPath = null;
    try {
      const stat = await fs.promises.stat(tempPath);
      const bitrate = (stat.size * 8) / (endTime - startTime);
      if (bitrate > STREAM_COPY_BITRATE * 1.25) {
        await renderStreamCopy(tempPath, tempStreamPath);
        streamPath = tempStreamPath;
      }
    } catch (streamError) {
      console.error("ClipX: Failed to render stream copy:", streamError);
    }

    let thumbnailPath = null;
    try {
      await renderClipThumbnail(screen?.videoPath || videoPath, startTime, endTime, tempThumbPath);
      thumbnailPath = tempThumbPath;
    } catch (thumbnailError) {
      console.error("ClipX: Failed to render thumbnail:", thumbnailError);
    }

    const result = await uploadClipToAzureBlobStorage({
      videoPath: tempPath,
      streamPath,
      thumbnailPath,
      title: clipTitle,
      userId,
    });
    return { status: 200, ...result };

  } finally {
    for (const filePath of [tempPath, tempThumbPath, tempStreamPath]) {
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

async function uploadClipToAzureBlobStorage({ videoPath, streamPath, thumbnailPath, title, userId }) {
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

  if (streamPath) {
    try {
      await uploadBlobToAzure({
        token,
        name: buildStreamBlobName(videoBlobName),
        contentType: "video/mp4",
        filePath: streamPath,
      });
    } catch (streamError) {
      console.error("ClipX: Failed to upload stream copy:", streamError);
    }
  }

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
    names.push({ name: buildStreamBlobName(blobName), container: AZURE_CLIPS_CONTAINER });
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

let tracksJob = Promise.resolve();

function queueTracksJob(job) {
  const result = tracksJob.then(job);
  tracksJob = result.catch(() => {});
  return result;
}

function getTracksDir() {
  return path.join(app.getPath("temp"), "clipx", "tracks");
}

export async function extractClipTracks(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("extract-clip-tracks: clipPath must be a non-empty string");
  }

  return queueTracksJob(() => extractTracks(clipPath));
}

async function extractTracks(clipPath) {
  const group = getClipGroup(clipPath);
  const tracks = getManifestFile(group?.manifest, path.basename(clipPath))?.audioTracks || [];
  if (!tracks.length) {
    return [];
  }

  const stat = await fs.promises.stat(clipPath);
  const key = createHash("sha1").update(`${clipPath}|${stat.size}|${stat.mtimeMs}`).digest("hex").slice(0, 16);
  const tracksDir = getTracksDir();
  const outputDir = path.join(tracksDir, key);
  for (const name of await fs.promises.readdir(tracksDir).catch(() => [])) {
    if (name !== key) {
      await fs.promises.rm(path.join(tracksDir, name), { recursive: true, force: true });
    }
  }

  const outputs = tracks.map((track) => ({ index: track.index, path: path.join(outputDir, `${track.index}.m4a`) }));
  if (outputs.every((output) => fs.existsSync(output.path))) {
    return outputs;
  }

  await fs.promises.mkdir(outputDir, { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      const command = ffmpeg(clipPath);
      for (const output of outputs) {
        command.output(output.path).outputOptions(["-map", `0:a:${output.index - 1}`, "-c", "copy"]);
      }
      command.on("end", resolve).on("error", reject).run();
    });
  } catch (error) {
    await fs.promises.rm(outputDir, { recursive: true, force: true });
    throw error;
  }

  return outputs;
}

export async function releaseClipTracks() {
  await queueTracksJob(() => fs.promises.rm(getTracksDir(), { recursive: true, force: true }));
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
