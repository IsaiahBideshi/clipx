import { execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

import { resolveFfmpegPath } from "./ffmpeg.js";

const execFileAsync = promisify(execFile);

async function getMediaDuration(filePath) {
  const { stderr } = await execFileAsync(resolveFfmpegPath(ffmpegPath), ["-hide_banner", "-i", filePath]).catch((error) => error);
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr));
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

export async function copyScreenAudio(videoPath, audioPath, outputPath) {
  const [audioDuration, videoDuration] = await Promise.all([getMediaDuration(audioPath), getMediaDuration(videoPath)]);
  if (audioDuration === null || videoDuration === null) {
    throw new Error("Couldn't read the recordings' lengths.");
  }

  const shift = audioDuration - videoDuration;
  await new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath).input(audioPath);
    if (shift >= 0) {
      command.seekInput(shift);
    } else {
      command.inputOptions(["-itsoffset", String(-shift)]);
    }
    command
      .output(outputPath)
      .outputOptions(["-map", "0:v:0", "-map", "1:a?", "-c", "copy", "-movflags +faststart"])
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}
