import { mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.AZURE_STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=clipxtest;AccountKey=a2V5;EndpointSuffix=core.windows.net";

const AVATAR_BASE = "https://clipxtest.blob.core.windows.net/user-avatars/";
const IDS = {
  public: "3f1c2b7a-9d4e-4c1a-8b2f-1a2b3c4d5e6f",
  googleAvatar: "4a4a4a4a-1111-4222-8333-444455556666",
  externalAvatar: "7a7a7a7a-1111-4222-8333-444455556666",
  friends: "5e6f7a8b-1c2d-4e3f-9a0b-c1d2e3f4a5b6",
  private: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  youtubeOnly: "0d0d0d0d-aaaa-4bbb-8ccc-dddddddddddd",
  missingBlob: "1e1e1e1e-2f2f-4a3a-8b4b-5c5c5c5c5c5c",
  dbError: "2f2f2f2f-3a3a-4b4b-8c5c-6d6d6d6d6d6d",
};

const rows = {
  clips: [
    { id: IDS.public, title: `<script>alert("x")</script>`, visibility: "public", blob_name: "owner/ace.mp4", owner_id: "owner", created_at: "2026-09-30T15:04:05Z" },
    { id: IDS.googleAvatar, title: "Clutch", visibility: "public", blob_name: "googler/clutch.mp4", owner_id: "googler", created_at: "2026-09-30T15:04:05Z" },
    { id: IDS.externalAvatar, title: "", visibility: "public", blob_name: "tracker/clip.mp4", owner_id: "tracker", created_at: "2026-09-30T15:04:05Z" },
    { id: IDS.friends, title: "Friends secret", visibility: "friends", blob_name: "owner/friends.mp4", owner_id: "owner", created_at: "2026-09-30T15:04:05Z" },
    { id: IDS.private, title: "Private secret", visibility: "private", blob_name: "owner/private.mp4", owner_id: "owner", created_at: "2026-09-30T15:04:05Z" },
    { id: IDS.youtubeOnly, title: "YouTube secret", visibility: "public", blob_name: "", owner_id: "owner", created_at: "2026-09-30T15:04:05Z" },
    { id: IDS.missingBlob, title: "Deleted secret", visibility: "public", blob_name: "owner/gone.mp4", owner_id: "owner", created_at: "2026-09-30T15:04:05Z" },
  ],
  users: [
    { id: "owner", username: "<b>isaiah</b>", avatar_url: `${AVATAR_BASE}owner/avatar.png` },
    { id: "googler", username: "googler", avatar_url: "https://lh3.googleusercontent.com/a/photo" },
    { id: "tracker", username: "tracker", avatar_url: "https://tracker.example/pixel.png" },
  ],
};
const existingBlobs = new Set(rows.clips.map((clip) => clip.blob_name).filter((name) => name && name !== "owner/gone.mp4"));
let clipQueries = 0;

function from(table) {
  if (table === "clips") clipQueries += 1;
  const filters = [];
  let failing = false;
  const query = {
    select() {
      return query;
    },
    eq(column, value) {
      failing ||= value === IDS.dbError;
      filters.push((row) => row[column] === value);
      return query;
    },
    neq(column, value) {
      filters.push((row) => row[column] != null && row[column] !== value);
      return query;
    },
    async maybeSingle() {
      if (failing) return { data: null, error: { message: "connection refused" } };
      return { data: rows[table].find((row) => filters.every((filter) => filter(row))) ?? null, error: null };
    },
  };
  return query;
}

class BlobNotFoundError extends Error {}

mock.module(new URL("../api-handlers/auth.js", import.meta.url).href, {
  namedExports: {
    supabase: { from },
    getBearerToken: () => null,
    getAuthenticatedUser: async () => ({ user: null, error: "Missing authorization token" }),
  },
});
mock.module(new URL("../api-handlers/clips/azure.js", import.meta.url).href, {
  namedExports: {
    BlobNotFoundError,
    containerClient: { getBlobClient: (name) => ({ exists: async () => existingBlobs.has(name) }) },
    getStreamUrl: async (name) => {
      if (!existingBlobs.has(name)) throw new BlobNotFoundError(`Blob "${name}" not found`);
      return `https://clipxtest.blob.core.windows.net/clips/${name}?sig=fresh`;
    },
    generateSasUrl: async () => "",
    deleteBlob: async () => {},
    SUPPORTED_CONTAINERS: ["clips", "clip-thumbnails"],
    CONTAINER_NAME: "clips",
    THUMBS_CONTAINER_NAME: "clip-thumbnails",
  },
});
mock.method(console, "error", () => {});

const { default: api } = await import("../api/index.js");

async function request(method, url) {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    redirect(code, location) { this.statusCode = code; this.headers.location = location; return this; },
  };
  await api({ method, url, headers: {}, query: {} }, res);
  return res;
}

test("renders a public clip with escaped details and the player", async () => {
  const res = await request("GET", `/clip/${IDS.public}?utm_source=discord`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
  assert.ok(res.body.includes(`data-src="/clip/${IDS.public}/video"`));
  assert.ok(res.body.includes("&#60;script&#62;alert(&#34;x&#34;)&#60;/script&#62;"));
  assert.ok(res.body.includes("&#60;b&#62;isaiah&#60;/b&#62;"));
  assert.ok(!res.body.includes("<script>alert"));
  assert.ok(res.body.includes(`<img class="clip-owner-avatar" src="${AVATAR_BASE}owner/avatar.png"`));
});

test("only loads avatars from ClipX storage or Google", async () => {
  const google = await request("GET", `/clip/${IDS.googleAvatar}`);
  assert.ok(google.body.includes(`src="https://lh3.googleusercontent.com/a/photo"`));

  const external = await request("GET", `/clip/${IDS.externalAvatar}`);
  assert.equal(external.statusCode, 200);
  assert.ok(!external.body.includes("tracker.example"));
  assert.ok(external.body.includes(`<span class="clip-owner-avatar">T</span>`));
});

test("hides clips that are not public or have no video", async () => {
  for (const id of [IDS.friends, IDS.private, IDS.youtubeOnly, IDS.missingBlob, "00000000-0000-4000-8000-000000000000"]) {
    const page = await request("GET", `/clip/${id}`);
    assert.equal(page.statusCode, 404, id);
    assert.ok(page.body.includes("We couldn't load this clip."), id);
    assert.ok(!page.body.includes("secret"), id);
    assert.ok(!page.body.includes("clip-player"), id);

    const video = await request("GET", `/clip/${id}/video`);
    assert.equal(video.statusCode, 404, id);
    assert.deepEqual(video.body, { data: null, error: "Clip not found" });
  }
});

test("rejects malformed clip urls without querying the database", async () => {
  const before = clipQueries;
  for (const url of ["/clip/not-a-uuid", "/clip/", `/clip/${IDS.public}/`, `/clip/${IDS.public}/thumbnail`]) {
    const res = await request("GET", url);
    assert.equal(res.statusCode, 404, url);
  }
  assert.equal(clipQueries, before);
});

test("redirects /video to a fresh stream url", async () => {
  const res = await request("GET", `/clip/${IDS.public}/video`);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "https://clipxtest.blob.core.windows.net/clips/owner/ace.mp4?sig=fresh");
});

test("fails closed on database errors and unsupported methods", async () => {
  const page = await request("GET", `/clip/${IDS.dbError}`);
  assert.equal(page.statusCode, 500);
  assert.ok(!page.body.includes("connection refused"));
  assert.equal((await request("GET", `/clip/${IDS.dbError}/video`)).statusCode, 500);
  assert.equal((await request("POST", `/clip/${IDS.public}`)).statusCode, 405);
});
