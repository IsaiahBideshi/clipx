import ffmpeg from "fluent-ffmpeg";
import { buildAudioOutputOptions } from "./audioMix.js";

export async function renderClipSegment(videoPath, startTime, endTime, outputPath, mix = null, screen = null) {
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
