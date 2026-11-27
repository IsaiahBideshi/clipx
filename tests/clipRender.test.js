import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { renderClipSegment } from "../electron/utils/clipRender.js";

const run = promisify(execFile);
ffmpeg.setFfmpegPath(ffmpegPath);

let dir;
let clipPath;
let screenPath;
before(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "clipx-save-test-"));
  clipPath = path.join(dir, "clip.mp4");
  screenPath = path.join(dir, "Screen 2.mp4");
  const video = ["-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=30"];
  const tone = (frequency) => ["-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=4`];
  await run(ffmpegPath, [
    ...video, ...tone(440), ...tone(660), ...tone(880),
    "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map", "3:a",
    "-c:v", "mpeg4", "-g", "15", "-c:a", "aac", clipPath,
  ]);
  await run(ffmpegPath, [...video, "-c:v", "mpeg4", "-g", "15", screenPath]);
});
after(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true });
});

async function getStreams(filePath) {
  const { stderr } = await run(ffmpegPath, ["-hide_banner", "-i", filePath]).catch((error) => error);
  return [...stderr.matchAll(/Stream #\d+:\d+.*?: (Video|Audio): (\w+)/g)].map(([, type, codec]) => `${type} ${codec}`);
}

test("saving a trim copies the video instead of re-encoding it", async () => {
  const outputPath = path.join(dir, "trim.mp4");
  await renderClipSegment(clipPath, 1, 3, outputPath);
  assert.deepEqual(await getStreams(outputPath), ["Video mpeg4", "Audio aac"]);
});

test("saving a custom audio mix still copies the video", async () => {
  const outputPath = path.join(dir, "mix.mp4");
  await renderClipSegment(clipPath, 1, 3, outputPath, [
    { index: 2, volume: 0.5 },
    { index: 3, volume: 0 },
  ]);
  assert.deepEqual(await getStreams(outputPath), ["Video mpeg4", "Audio aac"]);
});

test("saving a screen file copies its video with the clip's audio", async () => {
  const outputPath = path.join(dir, "screen.mp4");
  await renderClipSegment(screenPath, 1, 3, outputPath, null, { audioPath: clipPath, shift: 0 });
  assert.deepEqual(await getStreams(outputPath), ["Video mpeg4", "Audio aac"]);
});
