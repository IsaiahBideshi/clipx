import ffmpeg from "fluent-ffmpeg";
import { buildAudioOutputOptions } from "./audioMix.js";

export function killOnAbort(command, signal) {
  const kill = () => (command.ffmpegProc ? command.kill() : command.once("start", () => command.kill()));
  if (signal?.aborted) {
    kill();
  } else {
    signal?.addEventListener("abort", kill, { once: true });
  }
  return command;
}

export async function renderClipSegment(videoPath, startTime, endTime, outputPath, mix = null, screen = null, signal = null) {
  await new Promise((resolve, reject) => {
    const command = killOnAbort(ffmpeg(videoPath), signal).setStartTime(startTime);
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
