import { execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

import { resolveFfmpegPath } from "./ffmpeg.js";

const execFileAsync = promisify(execFile);

export async function getMediaDuration(filePath) {
  const { stderr } = await execFileAsync(resolveFfmpegPath(ffmpegPath), ["-hide_banner", "-i", filePath]).catch((error) => error);
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr));
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

export async function copyScreenAudio(source, outputPath) {
  await new Promise((resolve, reject) => {
    const command = ffmpeg(source.videoPath).input(source.audioPath);
    if (source.shift >= 0) {
      command.seekInput(source.shift);
    } else {
      command.inputOptions(["-itsoffset", String(-source.shift)]);
    }
    command
      .output(outputPath)
      .outputOptions(["-map", "0:v:0", "-map", "1:a?", "-c", "copy", "-movflags +faststart"])
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}
