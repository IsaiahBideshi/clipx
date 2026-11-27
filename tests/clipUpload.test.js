import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { uploadClipFiles } from "../electron/utils/clipUpload.js";

const BLOCK_BYTES = 8 * 1024 * 1024;
const HANG_WATCHDOG = { timeout: 60_000 };

let dir;
before(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "clipx-upload-test-"));
});
after(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true });
});

async function writeFile(name, size) {
  const filePath = path.join(dir, name);
  await fs.promises.writeFile(filePath, Buffer.alloc(size, 1));
  return filePath;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

async function startFakeAzure({ holdBlocksUntil = 0, isExpired = () => false } = {}) {
  const events = new EventEmitter();
  const uploads = [];
  const blockBytes = new Map();
  const held = [];
  let openBlocks = 0;
  let peakBlocks = 0;
  let holding = holdBlocksUntil > 0;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (url.pathname === "/api/clips") {
      const body = JSON.parse(await readBody(req));
      if (isExpired(req.headers.authorization)) {
        return sendJson(res, 401, { error: "Invalid or expired session" });
      }
      if (req.method === "DELETE") {
        return sendJson(res, 200, { data: null });
      }
      const blobPath = [body.container, ...body.name.split("/")].map(encodeURIComponent).join("/");
      return sendJson(res, 200, { data: { url: `${fake.base}/blob/${blobPath}?sig=fake`, name: body.name } });
    }

    const [, , container, ...nameParts] = url.pathname.split("/");
    const name = nameParts.map(decodeURIComponent).join("/");
    const comp = url.searchParams.get("comp");

    if (comp === "block") {
      openBlocks++;
      peakBlocks = Math.max(peakBlocks, openBlocks);
      const body = await readBody(req);
      blockBytes.set(name, (blockBytes.get(name) || 0) + body.length);
      if (holding && openBlocks < holdBlocksUntil) {
        await new Promise((resolve) => held.push(resolve));
      } else {
        holding = false;
        for (const release of held.splice(0)) release();
      }
      openBlocks--;
      return res.writeHead(201).end();
    }

    const body = await readBody(req);
    const upload = {
      container,
      name,
      bytes: comp === "blocklist" ? blockBytes.get(name) : body.length,
      contentType: req.headers["x-ms-blob-content-type"],
    };
    uploads.push(upload);
    events.emit("upload", upload);
    res.writeHead(201).end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const fake = {
    base: `http://127.0.0.1:${server.address().port}`,
    events,
    uploads,
    get peakBlocks() {
      return peakBlocks;
    },
    close: () => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    }),
  };
  return fake;
}

function clipOptions(overrides) {
  return {
    streamRender: Promise.resolve(null),
    thumbnailRender: Promise.resolve(null),
    videoName: "My clip.mp4",
    thumbnailName: "My clip.jpg",
    userId: "user-1",
    ...overrides,
  };
}

test("uploads a large clip in 8 MiB blocks, 8 at once", HANG_WATCHDOG, async (t) => {
  const fake = await startFakeAzure({ holdBlocksUntil: 8 });
  t.after(fake.close);
  const videoPath = await writeFile("large.mp4", 8 * BLOCK_BYTES);
  const api = { base: fake.base, getToken: async () => "token" };

  const result = await uploadClipFiles(api, clipOptions({ videoPath }));

  assert.equal(fake.peakBlocks, 8);
  assert.match(result.blobName, /^user-1\/.+-My clip\.mp4$/);
  assert.deepEqual(fake.uploads, [
    { container: "clips", name: result.blobName, bytes: 8 * BLOCK_BYTES, contentType: "video/mp4" },
  ]);
});

test("uploads the clip without waiting for the stream copy to render", HANG_WATCHDOG, async (t) => {
  const fake = await startFakeAzure();
  t.after(fake.close);
  const videoPath = await writeFile("clip.mp4", 1000);
  const streamPath = await writeFile("clip-stream.mp4", 500);
  const api = { base: fake.base, getToken: async () => "token" };
  const streamRender = once(fake.events, "upload").then(() => streamPath);

  const result = await uploadClipFiles(api, clipOptions({ videoPath, streamRender }));

  assert.deepEqual(fake.uploads.map(({ name, bytes }) => [name, bytes]), [
    [result.blobName, 1000],
    [result.blobName.replace(/\.mp4$/, ".stream.mp4"), 500],
  ]);
});

test("reports uploaded bytes across the clip and its stream copy", HANG_WATCHDOG, async (t) => {
  const fake = await startFakeAzure();
  t.after(fake.close);
  const videoPath = await writeFile("progress.mp4", 3 * BLOCK_BYTES);
  const streamPath = await writeFile("progress-stream.mp4", 500);
  const api = { base: fake.base, getToken: async () => "token" };
  const progress = [];

  await uploadClipFiles(api, clipOptions({
    videoPath,
    streamRender: Promise.resolve(streamPath),
    onProgress: (bytes) => progress.push(bytes),
  }));

  assert.ok(progress.includes(3 * BLOCK_BYTES));
  assert.equal(progress.at(-1), 3 * BLOCK_BYTES + 500);
  assert.deepEqual(progress, [...progress].sort((a, b) => a - b));
});

test("keeps the thumbnail when the login token is refreshed during the upload", HANG_WATCHDOG, async (t) => {
  const expired = new Set();
  const fake = await startFakeAzure({ isExpired: (authorization) => expired.has(authorization) });
  t.after(fake.close);
  const videoPath = await writeFile("refresh.mp4", 1000);
  const thumbnailPath = await writeFile("refresh.jpg", 100);
  let token = "old";
  const api = { base: fake.base, getToken: async () => token };
  fake.events.once("upload", () => {
    expired.add("Bearer old");
    token = "new";
  });

  const result = await uploadClipFiles(api, clipOptions({ videoPath, thumbnailRender: Promise.resolve(thumbnailPath) }));

  assert.match(result.thumbnailBlobName, /^user-1\/.+-My clip\.jpg$/);
  assert.deepEqual(fake.uploads.map(({ container, contentType }) => [container, contentType]), [
    ["clips", "video/mp4"],
    ["clip-thumbnails", "image/jpeg"],
  ]);
});
