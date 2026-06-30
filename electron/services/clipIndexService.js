import { app } from "electron";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import chokidar from "chokidar";

import { getFastFileId } from "../utils/hashing.js";
import { isSkippableMediaDirectory, isSupportedVideoFile } from "../utils/videoFiles.js";

const DB_FILE_NAME = "clip-index.sqlite";
const LEGACY_CLIPS_DATA_FILE = "clipsData.json";
const SAVED_CLIPS_DIR_NAME = "ClipX Videos";
const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;
const LIVE_EVENT_DEBOUNCE_MS = 450;

let db = null;
const watcherByRootPath = new Map();
const reconcileByRootPath = new Map();
const liveEventTimers = new Map();
let legacyClipDataCache = null;
let legacyClipDataCacheMs = 0;

export const clipIndexEvents = new EventEmitter();

function normalizeStoredPath(input) {
  return path.normalize(String(input || ""));
}

function getClipxDataDir() {
  const clipxDir = path.join(app.getPath("appData"), "clipx");
  fs.mkdirSync(clipxDir, { recursive: true });
  return clipxDir;
}

function getDb() {
  if (db) {
    return db;
  }

  try {
    db = new Database(path.join(getClipxDataDir(), DB_FILE_NAME));
  } catch (error) {
    if (error?.code === "ERR_DLOPEN_FAILED" || /NODE_MODULE_VERSION/.test(String(error?.message || ""))) {
      error.message = `${error.message}\n\nClipX uses Electron, so native modules must be rebuilt for Electron's Node ABI. Run: npm.cmd run rebuild:electron`;
    }
    throw error;
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      path TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      collection TEXT NOT NULL CHECK (collection IN ('source', 'saved')),
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at_ms REAL NOT NULL,
      modified_at_ms REAL NOT NULL,
      indexed_at_ms REAL NOT NULL,
      missing INTEGER NOT NULL DEFAULT 0,
      thumbnail_path TEXT,
      saved_metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clips_page
      ON clips(root_path, collection, missing, created_at_ms DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_clips_id
      ON clips(id);
  `);

  return db;
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function rowToClip(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    size: row.size,
    createdAt: row.created_at_ms,
    modifiedAt: row.modified_at_ms,
    createdAtMs: row.created_at_ms,
    modifiedAtMs: row.modified_at_ms,
    collection: row.collection,
    thumbnailPath: row.thumbnail_path || null,
    savedMetadata: parseJson(row.saved_metadata_json),
  };
}

function emitIndexEvent(event) {
  clipIndexEvents.emit("change", {
    ...event,
    emittedAt: Date.now(),
  });
}

function emitIndexingStatus(rootPath, indexing, extra = {}) {
  emitIndexEvent({
    type: "indexing-status",
    rootPath,
    indexing,
    ...extra,
  });
}

function isInsideRoot(rootPath, filePath) {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function pathSegments(filePath) {
  return normalizeStoredPath(filePath).split(/[\\/]+/).filter(Boolean);
}

function isIgnoredPath(filePath) {
  return pathSegments(filePath).some((segment) => {
    const normalized = segment.toLowerCase();
    return normalized === "thumbs" || normalized === "saved clips thumbs";
  });
}

function getCollectionForPath(rootPath, filePath) {
  const relativePath = path.relative(rootPath, filePath);
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const hasSavedSegment = segments.some(
    (segment) => segment.toLowerCase() === SAVED_CLIPS_DIR_NAME.toLowerCase()
  );
  return hasSavedSegment ? "saved" : "source";
}

function shouldIndexFile(rootPath, filePath) {
  return (
    isInsideRoot(rootPath, filePath) &&
    !isIgnoredPath(filePath) &&
    isSupportedVideoFile(filePath)
  );
}

function readLegacyClipData() {
  const now = Date.now();
  if (legacyClipDataCache && now - legacyClipDataCacheMs < 2000) {
    return legacyClipDataCache;
  }

  const legacyPath = path.join(app.getPath("appData"), LEGACY_CLIPS_DATA_FILE);
  try {
    const raw = fs.readFileSync(legacyPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : { clips: [] };
    const clips = Array.isArray(parsed?.clips) ? parsed.clips : Array.isArray(parsed) ? parsed : [];
    legacyClipDataCache = clips;
    legacyClipDataCacheMs = now;
    return clips;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("ClipX: Failed to read legacy clipsData.json:", error);
    }
    legacyClipDataCache = [];
    legacyClipDataCacheMs = now;
    return [];
  }
}

function findLegacyClipMetadata(filePath) {
  const normalizedPath = normalizeStoredPath(filePath);
  return readLegacyClipData().find((item) => normalizeStoredPath(item?.path) === normalizedPath) || null;
}

function getRowByPath(filePath) {
  return getDb()
    .prepare("SELECT * FROM clips WHERE path = ?")
    .get(normalizeStoredPath(filePath));
}

export function listLocalClips(options = {}) {
  const rootPath = normalizeStoredPath(options.rootPath);
  const collection = options.collection === "saved" ? "saved" : "source";
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = options.cursor || null;

  if (!rootPath) {
    return { clips: [], nextCursor: null, hasMore: false };
  }

  const params = [rootPath, collection];
  let cursorClause = "";

  if (cursor?.createdAtMs != null && cursor?.id) {
    const cursorCreatedAt = Number(cursor.createdAtMs);
    if (Number.isFinite(cursorCreatedAt)) {
      cursorClause = "AND (created_at_ms < ? OR (created_at_ms = ? AND id < ?))";
      params.push(cursorCreatedAt, cursorCreatedAt, String(cursor.id));
    }
  }

  params.push(limit + 1);
  const rows = getDb()
    .prepare(`
      SELECT *
      FROM clips
      WHERE root_path = ?
        AND collection = ?
        AND missing = 0
        ${cursorClause}
      ORDER BY created_at_ms DESC, id DESC
      LIMIT ?
    `)
    .all(...params);

  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows[pageRows.length - 1];

  return {
    clips: pageRows.map(rowToClip),
    hasMore: rows.length > limit,
    nextCursor: lastRow ? { createdAtMs: lastRow.created_at_ms, id: lastRow.id } : null,
  };
}

export function getCachedThumbnailPath(videoPath) {
  const row = getDb()
    .prepare("SELECT thumbnail_path FROM clips WHERE path = ? AND missing = 0")
    .get(normalizeStoredPath(videoPath));

  if (!row?.thumbnail_path) {
    return null;
  }

  if (!fs.existsSync(row.thumbnail_path)) {
    getDb()
      .prepare("UPDATE clips SET thumbnail_path = NULL WHERE path = ?")
      .run(normalizeStoredPath(videoPath));
    return null;
  }

  return row.thumbnail_path;
}

export function setCachedThumbnailPath(videoPath, thumbnailPath) {
  getDb()
    .prepare("UPDATE clips SET thumbnail_path = ?, indexed_at_ms = ? WHERE path = ?")
    .run(normalizeStoredPath(thumbnailPath), Date.now(), normalizeStoredPath(videoPath));
}

export function getIndexedClipData(clipPath) {
  const row = getDb()
    .prepare("SELECT saved_metadata_json FROM clips WHERE path = ?")
    .get(normalizeStoredPath(clipPath));

  return parseJson(row?.saved_metadata_json);
}

export function setIndexedClipMetadata(clipPath, metadata) {
  if (!metadata || typeof metadata !== "object") {
    return;
  }

  legacyClipDataCache = null;
  getDb()
    .prepare("UPDATE clips SET saved_metadata_json = ?, indexed_at_ms = ? WHERE path = ?")
    .run(JSON.stringify(metadata), Date.now(), normalizeStoredPath(clipPath));
}

export async function upsertIndexedClip(rootPath, filePath, options = {}) {
  const normalizedRootPath = normalizeStoredPath(rootPath);
  const normalizedFilePath = normalizeStoredPath(filePath);

  if (!shouldIndexFile(normalizedRootPath, normalizedFilePath)) {
    return null;
  }

  let stats;
  try {
    stats = await fs.promises.stat(normalizedFilePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      markIndexedClipMissing(normalizedFilePath, options);
      return null;
    }
    throw error;
  }

  if (!stats.isFile()) {
    return null;
  }

  const id = await getFastFileId(normalizedFilePath, stats);
  const collection = getCollectionForPath(normalizedRootPath, normalizedFilePath);
  const existingRow = getRowByPath(normalizedFilePath);
  const savedMetadata = collection === "saved" ? findLegacyClipMetadata(normalizedFilePath) : null;

  getDb()
    .prepare(`
      INSERT INTO clips (
        path,
        id,
        root_path,
        collection,
        name,
        size,
        created_at_ms,
        modified_at_ms,
        indexed_at_ms,
        missing,
        saved_metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(path) DO UPDATE SET
        id = excluded.id,
        root_path = excluded.root_path,
        collection = excluded.collection,
        name = excluded.name,
        size = excluded.size,
        created_at_ms = excluded.created_at_ms,
        modified_at_ms = excluded.modified_at_ms,
        indexed_at_ms = excluded.indexed_at_ms,
        missing = 0,
        saved_metadata_json = COALESCE(excluded.saved_metadata_json, clips.saved_metadata_json)
    `)
    .run(
      normalizedFilePath,
      id,
      normalizedRootPath,
      collection,
      path.basename(normalizedFilePath),
      stats.size,
      stats.birthtimeMs,
      stats.mtimeMs,
      Date.now(),
      savedMetadata ? JSON.stringify(savedMetadata) : null
    );

  const clip = rowToClip(getRowByPath(normalizedFilePath));
  if (options.emitChange) {
    emitIndexEvent({
      type: existingRow ? "updated" : "added",
      rootPath: normalizedRootPath,
      collection,
      clip,
    });
  }

  return clip;
}

export function markIndexedClipMissing(filePath, options = {}) {
  const normalizedFilePath = normalizeStoredPath(filePath);
  const existingRow = getRowByPath(normalizedFilePath);

  if (!existingRow) {
    return null;
  }

  getDb()
    .prepare("UPDATE clips SET missing = 1, indexed_at_ms = ? WHERE path = ?")
    .run(Date.now(), normalizedFilePath);

  const clip = rowToClip({ ...existingRow, missing: 1 });
  if (options.emitChange) {
    emitIndexEvent({
      type: "removed",
      rootPath: existingRow.root_path,
      collection: existingRow.collection,
      clip,
    });
  }

  return clip;
}

function queueLiveUpsert(rootPath, filePath) {
  const normalizedRootPath = normalizeStoredPath(rootPath);
  const normalizedFilePath = normalizeStoredPath(filePath);

  if (!shouldIndexFile(normalizedRootPath, normalizedFilePath)) {
    return;
  }

  if (liveEventTimers.has(normalizedFilePath)) {
    clearTimeout(liveEventTimers.get(normalizedFilePath));
  }

  liveEventTimers.set(
    normalizedFilePath,
    setTimeout(async () => {
      liveEventTimers.delete(normalizedFilePath);
      try {
        await upsertIndexedClip(normalizedRootPath, normalizedFilePath, { emitChange: true });
      } catch (error) {
        console.error("ClipX: Failed to index changed clip:", normalizedFilePath, error);
      }
    }, LIVE_EVENT_DEBOUNCE_MS)
  );
}

function ensureWatcher(rootPath) {
  const normalizedRootPath = normalizeStoredPath(rootPath);
  if (!normalizedRootPath || watcherByRootPath.has(normalizedRootPath)) {
    return;
  }

  const watcher = chokidar.watch(normalizedRootPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1200,
      pollInterval: 150,
    },
    ignored: (candidatePath) => isIgnoredPath(candidatePath),
  });

  watcher
    .on("add", (filePath) => queueLiveUpsert(normalizedRootPath, filePath))
    .on("change", (filePath) => queueLiveUpsert(normalizedRootPath, filePath))
    .on("unlink", (filePath) => markIndexedClipMissing(filePath, { emitChange: true }))
    .on("error", (error) => {
      console.error("ClipX: Clip index watcher failed:", error);
      emitIndexingStatus(normalizedRootPath, false, { error: String(error?.message || error) });
    });

  watcherByRootPath.set(normalizedRootPath, watcher);
}

async function reconcileRoot(rootPath) {
  const normalizedRootPath = normalizeStoredPath(rootPath);
  const seenPaths = new Set();
  emitIndexingStatus(normalizedRootPath, true);

  try {
    if (!fs.existsSync(normalizedRootPath)) {
      emitIndexingStatus(normalizedRootPath, false, {
        indexedCount: 0,
        error: "Root folder does not exist",
      });
      return;
    }

    const pendingDirs = [normalizedRootPath];
    while (pendingDirs.length > 0) {
      const currentDir = pendingDirs.pop();
      let entries = [];

      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (error) {
        console.error("ClipX: Failed to read directory while indexing:", currentDir, error);
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!isSkippableMediaDirectory(fullPath)) {
            pendingDirs.push(fullPath);
          }
          continue;
        }

        if (!entry.isFile() || !shouldIndexFile(normalizedRootPath, fullPath)) {
          continue;
        }

        const normalizedFilePath = normalizeStoredPath(fullPath);
        seenPaths.add(normalizedFilePath);

        try {
          await upsertIndexedClip(normalizedRootPath, normalizedFilePath);
        } catch (error) {
          console.error("ClipX: Failed to index clip:", normalizedFilePath, error);
        }
      }
    }

    const rows = getDb()
      .prepare("SELECT path FROM clips WHERE root_path = ? AND missing = 0")
      .all(normalizedRootPath);

    const markMissing = getDb().prepare("UPDATE clips SET missing = 1, indexed_at_ms = ? WHERE path = ?");
    const markMissingTransaction = getDb().transaction((staleRows) => {
      const now = Date.now();
      for (const row of staleRows) {
        markMissing.run(now, row.path);
      }
    });

    markMissingTransaction(rows.filter((row) => !seenPaths.has(row.path)));
    emitIndexingStatus(normalizedRootPath, false, { indexedCount: seenPaths.size });
  } catch (error) {
    console.error("ClipX: Clip index reconciliation failed:", error);
    emitIndexingStatus(normalizedRootPath, false, { error: String(error?.message || error) });
  }
}

export async function refreshLocalClipIndex(options = {}) {
  const rootPath = normalizeStoredPath(options.rootPath);
  if (!rootPath) {
    throw new TypeError("refresh-local-clip-index: rootPath must be a non-empty string");
  }

  ensureWatcher(rootPath);

  if (!reconcileByRootPath.has(rootPath)) {
    const reconcilePromise = reconcileRoot(rootPath).finally(() => {
      reconcileByRootPath.delete(rootPath);
    });
    reconcileByRootPath.set(rootPath, reconcilePromise);
  }

  return { indexing: true };
}

export async function closeClipIndexService() {
  const watchers = Array.from(watcherByRootPath.values());
  watcherByRootPath.clear();
  liveEventTimers.forEach((timer) => clearTimeout(timer));
  liveEventTimers.clear();
  await Promise.allSettled(watchers.map((watcher) => watcher.close()));

  if (db) {
    db.close();
    db = null;
  }
}
