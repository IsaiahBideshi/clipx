import crypto from "crypto";
import fs from "fs";

export async function getFastFileId(filePath, stats, bytesToRead = 256 * 1024) {
  const fd = await fs.promises.open(filePath, "r");
  try {
    const toRead = Math.min(bytesToRead, stats.size);
    const buf = Buffer.allocUnsafe(toRead);

    const { bytesRead } = await fd.read(buf, 0, toRead, 0);
    const headHash = crypto
      .createHash("sha256")
      .update(buf.subarray(0, bytesRead))
      .digest("hex");

    return `${stats.size}:${stats.mtimeMs}:${headHash}`;
  } catch (error) {
    console.error("Error generating file ID for", filePath, error);
    throw error;
  } finally {
    await fd.close();
  }
}
