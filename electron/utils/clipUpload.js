import { randomUUID } from "node:crypto";
import { buildStreamBlobName } from "./streamCopy.js";

const CLIPS_CONTAINER = "clips";
const THUMBS_CONTAINER = "clip-thumbnails";
const UPLOAD_BLOCK_BYTES = 8 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 8;

async function requireAccessToken(api) {
  const token = await api.getToken();
  if (!token) {
    throw new Error("Not authenticated. Please log in first.");
  }
  return token;
}

async function uploadBlob(api, { name, contentType, filePath, container = CLIPS_CONTAINER, onProgress, signal }) {
  const sasRes = await fetch(`${api.base}/api/clips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await requireAccessToken(api)}`,
    },
    body: JSON.stringify({ name, contentType, container }),
    signal,
  });

  if (!sasRes.ok) {
    const err = await sasRes.json().catch(() => null);
    throw new Error(err?.error || `Failed to get upload URL (${sasRes.status})`);
  }

  const { data } = await sasRes.json();
  const { BlockBlobClient } = await import("@azure/storage-blob");
  try {
    await new BlockBlobClient(data.url).uploadFile(filePath, {
      blobHTTPHeaders: { blobContentType: contentType },
      blockSize: UPLOAD_BLOCK_BYTES,
      maxSingleShotSize: UPLOAD_BLOCK_BYTES,
      concurrency: UPLOAD_CONCURRENCY,
      onProgress,
      abortSignal: signal,
    });
  } catch (error) {
    signal?.throwIfAborted();
    console.error("ClipX: Azure upload failed:", error);
    throw new Error(`Azure upload failed (${error?.statusCode || error?.code || "network error"})`);
  }
}

export async function uploadClipFiles(api, { videoPath, streamRender, thumbnailRender, videoName, thumbnailName, userId, onProgress = () => {}, signal = null }) {
  await requireAccessToken(api);
  if (!userId) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const blobPrefix = `${userId}/`;
  const videoBlobName = `${blobPrefix}${randomUUID()}-${videoName}`;

  let videoBytes = 0;
  await uploadBlob(api, {
    name: videoBlobName,
    contentType: "video/mp4",
    filePath: videoPath,
    onProgress: ({ loadedBytes }) => {
      videoBytes = loadedBytes;
      onProgress(loadedBytes);
    },
    signal,
  }).catch((error) => {
    if (!signal?.aborted) throw error;
  });

  const streamPath = await streamRender;
  if (streamPath && !signal?.aborted) {
    try {
      await uploadBlob(api, {
        name: buildStreamBlobName(videoBlobName),
        contentType: "video/mp4",
        filePath: streamPath,
        onProgress: ({ loadedBytes }) => onProgress(videoBytes + loadedBytes),
        signal,
      });
    } catch (streamError) {
      console.error("ClipX: Failed to upload stream copy:", streamError);
    }
  }

  let thumbnailBlobName = null;
  const thumbnailPath = await thumbnailRender;
  if (thumbnailPath && !signal?.aborted) {
    try {
      thumbnailBlobName = `${blobPrefix}${randomUUID()}-${thumbnailName}`;
      await uploadBlob(api, {
        name: thumbnailBlobName,
        contentType: "image/jpeg",
        filePath: thumbnailPath,
        container: THUMBS_CONTAINER,
        signal,
      });
    } catch (thumbnailError) {
      console.error("ClipX: Failed to upload thumbnail:", thumbnailError);
      try {
        await deleteBlob(api, { name: thumbnailBlobName, container: THUMBS_CONTAINER });
      } catch (cleanupError) {
        console.error("ClipX: Failed to clean up thumbnail blob after upload failure:", cleanupError);
      }
      thumbnailBlobName = null;
    }
  }

  if (signal?.aborted) {
    await deleteClipBlobs(api, { blobName: videoBlobName, thumbnailBlobName }).catch((cleanupError) => {
      console.error("ClipX: Failed to delete the blobs of a cancelled upload:", cleanupError);
    });
    signal.throwIfAborted();
  }

  return { blobName: videoBlobName, thumbnailBlobName };
}

async function deleteBlob(api, { name, container }) {
  const res = await fetch(`${api.base}/api/clips`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await requireAccessToken(api)}`,
    },
    body: JSON.stringify({ name, container }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Failed to delete blob (${res.status})`);
  }
}

export async function deleteClipBlobs(api, { blobName, thumbnailBlobName }) {
  await requireAccessToken(api);

  const names = [];
  if (blobName) {
    names.push({ name: blobName, container: CLIPS_CONTAINER });
    names.push({ name: buildStreamBlobName(blobName), container: CLIPS_CONTAINER });
  }
  if (thumbnailBlobName) {
    names.push({ name: thumbnailBlobName, container: THUMBS_CONTAINER });
  }

  for (const { name, container } of names) {
    await deleteBlob(api, { name, container });
  }
}
