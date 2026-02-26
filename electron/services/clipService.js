import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

import { uploadClipToYoutube } from "./youtubeService.js";

ffmpeg.setFfmpegPath(ffmpegPath);

const CLIPS_DATA_FILE = "clipsData.json";

function buildClipOutputName(baseName) {
  const safeName = String(baseName || "Untitled Clip")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim();
  return `${safeName || "Untitled Clip"}.mp4`;
}

async function renderClipSegment(videoPath, startTime, endTime, outputPath) {
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
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
  const clipDataPath = path.join(clipDir, CLIPS_DATA_FILE);
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
  const clipDataPath = path.join(clipDir, CLIPS_DATA_FILE);
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
}

export async function saveClip(options) {
  const clip = options.clip;
  const videoPath = clip.path;
  const startTime = options.start;
  const endTime = options.end;
  const clipTitle = options.title || `Untitled Clip ${Date.now()}`;
  const tags = options.tags || [];
  const game = options.game || null;

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
    game,
  });

  return 200;
}

export async function uploadClip(app, options) {
  const clip = options?.clip;
  const videoPath = clip?.path;
  const startTime = options?.start;
  const endTime = options?.end;
  const clipTitle = options?.title || `Untitled Clip ${Date.now()}`;
  const tags = options?.tags || [];
  const game = options?.game || null;

  if (!videoPath || typeof videoPath !== "string") {
    throw new TypeError("upload-clip: videoPath must be a non-empty string");
  }
  if (typeof startTime !== "number" || typeof endTime !== "number" || startTime < 0 || endTime <= startTime) {
    throw new TypeError("upload-clip: Invalid startTime or endTime");
  }

  const tempDir = path.join(app.getPath("temp"), "clipx", "uploads");
  await fs.promises.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${Date.now()}-${buildClipOutputName(clipTitle)}`);

  try {
    await renderUpscaledClipSegment4K(videoPath, startTime, endTime, tempPath);
    const result = await uploadClipToYoutube({
      videoPath: tempPath,
      title: clipTitle,
      tags,
      game,
    });

    return {
      status: 200,
      ...result,
    };
  } finally {
    try {
      await fs.promises.unlink(tempPath);
    } catch (_error) {
    }
  }
}

export async function getClipData(clipPath) {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("get-clip-data: clipPath must be a non-empty string");
  }

  const clipDir = path.dirname(clipPath);
  const clipsData = await getClipDataFromDir(clipDir);
  const clipEntry = clipsData.clips.find((item) => item.path === clipPath);
  return clipEntry || null;
}
