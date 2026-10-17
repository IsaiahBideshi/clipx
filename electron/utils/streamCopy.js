import ffmpeg from "fluent-ffmpeg";

export const STREAM_COPY_BITRATE = 8_000_000;

export function buildStreamBlobName(blobName) {
  return `${String(blobName).replace(/\.mp4$/, "")}.stream.mp4`;
}

export async function renderStreamCopy(videoPath, outputPath) {
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters("scale=-2:'min(1080,ih)'")
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-crf 23",
        `-maxrate ${STREAM_COPY_BITRATE}`,
        `-bufsize ${STREAM_COPY_BITRATE * 2}`,
        "-force_key_frames expr:gte(t,n_forced*2)",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-c:a aac",
        "-b:a 160k",
      ])
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}
