import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { BlobServiceClient } from "@azure/storage-blob";

import { buildStreamBlobName, renderStreamCopy } from "../electron/utils/streamCopy.js";

ffmpeg.setFfmpegPath(ffmpegPath);

const container = BlobServiceClient
  .fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
  .getContainerClient("clips");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipx-backfill-"));
const originalPath = path.join(tempDir, "original.mp4");
const copyPath = path.join(tempDir, "copy.mp4");

const names = [];
for await (const blob of container.listBlobsFlat()) {
  names.push(blob.name);
}

for (const name of names) {
  if (name.endsWith(".stream.mp4") || names.includes(buildStreamBlobName(name))) {
    continue;
  }

  try {
    await container.getBlobClient(name).downloadToFile(originalPath);
    await renderStreamCopy(originalPath, copyPath);

    if (fs.statSync(copyPath).size > fs.statSync(originalPath).size * 0.8) {
      console.log(`skipped (already small): ${name}`);
      continue;
    }

    await container.getBlockBlobClient(buildStreamBlobName(name)).uploadFile(copyPath, {
      blobHTTPHeaders: { blobContentType: "video/mp4" },
    });
    console.log(`copied: ${name}`);
  } catch (error) {
    console.error(`failed: ${name}`, error);
  }
}

fs.rmSync(tempDir, { recursive: true, force: true });
