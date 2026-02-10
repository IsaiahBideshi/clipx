import { app, BrowserWindow, ipcMain, dialog, protocol, net } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
ffmpeg.setFfmpegPath(ffmpegPath);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  {
    scheme: "clipx",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);


app.whenReady().then(() => {
  createWindow();

  protocol.handle("clipx", async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.searchParams.get("path") || "");
    const host = url.host; // "video" or "image"

    if (!filePath) {
      return new Response("Missing path", { status: 400 });
    }

    const fileStat = fs.statSync(filePath);
    const range = request.headers.get('range');
    let start = 0, end = fileStat.size - 1;
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        start = match[1] ? parseInt(match[1], 10) : start;
        end = match[2] ? parseInt(match[2], 10) : end;
      }
    }
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    const mimeType = getMimeType(filePath);

    if (host === "video") {
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".webm" ? "video/webm" :
          ext === ".mkv" ? "video/x-matroska" :
            ext === ".mov" ? "video/quicktime" :
              "video/mp4";

      return new Response(stream, {
        status: range ? 206 : 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
        },
      });
    }

    else if (host === "image") {
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
          ext === ".png" ? "image/png" :
            ext === ".webp" ? "image/webp" :
              "application/octet-stream";

      return new Response(fs.createReadStream(filePath), {
        headers: { "Content-Type": contentType },
      });
    }

    return new Response("Unknown clipx route", { status: 404 });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
});

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.mp3':
      return 'audio/mpeg';
    case '.mp4':
      return 'video/mp4';
    case '.jpg':
      return 'video/jpg';
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 850,
    webPreferences:{
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.maximize();
  win.loadURL("http://localhost:5173");
  win.webContents.openDevTools();

}

async function generateThumbnail(videoPath, thumbsDir) {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const thumbPath = path.join(thumbsDir, `${baseName}.jpg`);

  // cache check
  if (fs.existsSync(thumbPath)) {
    return thumbPath;
  }

  await fs.promises.mkdir(thumbsDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["1"], // 1 second in = avoids black frames
        filename: `${baseName}.jpg`,
        folder: thumbsDir,
        size: "320x180",
      })
      .on("end", () => resolve(thumbPath))
      .on("error", reject);
  });
}


async function getFastFileId(filePath, stats, bytesToRead = 256 * 1024) {
  const fd = await fs.promises.open(filePath, "r");
  try {
    const toRead = Math.min(bytesToRead, stats.size);
    const buf = Buffer.allocUnsafe(toRead);

    const { bytesRead } = await fd.read(buf, 0, toRead, 0);
    const headHash = crypto.createHash("sha256").update(buf.subarray(0, bytesRead)).digest("hex");

    // Include size + mtime for quick change detection; include head hash for better uniqueness
    return `${stats.size}:${stats.mtimeMs}:${headHash}`;
  } finally {
    await fd.close();
  }
}

ipcMain.handle("pick-video-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mkv", "mov"] },
    ],
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("scan-folder", async (_event, folderPath) => {
  // if (!folderPath || typeof folderPath !== "string") return [];

  const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".flv", ".wmv", ".webm"];

  try{
    const entries = await fs.promises.readdir(folderPath , { withFileTypes: true });
    const clips = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.includes(ext)) continue;

      const fullPath = path.join(folderPath, entry.name);
      const stats = await fs.promises.stat(fullPath);

      let id;
      try {
        id = await getFastFileId(fullPath, stats);
      } catch (e) {
        console.error("ClipX: Failed to get file ID for", fullPath, e);
        continue;
      }

      const newClip = {
        id,
        name: entry.name,
        path: fullPath,
        size: stats.size,
        createdAt: stats.birthtimeMs,        modifiedAt: stats.mtimeMs,
      };

      clips.push(newClip);
    }
    clips.sort((a, b) => b.createdAt - a.createdAt);

    return clips;
  } catch (e) {
    console.error("ClipX: Scan error:", e);
    return [];
  }
});


ipcMain.handle("get-thumbnail", async (_e, clipPath, baseFolder) => {
  if (typeof clipPath !== "string" || clipPath.length === 0) {
    throw new TypeError("get-thumbnail: clipPath must be a non-empty string");
  }

  // If baseFolder isn't provided by the renderer, default to the clip's directory
  const safeBaseFolder =
    typeof baseFolder === "string" && baseFolder.length > 0
      ? baseFolder
      : path.dirname(clipPath);

  const thumbsDir = path.join(safeBaseFolder, "thumbs");
  const thumbPath = await generateThumbnail(clipPath, thumbsDir);
  return thumbPath;
});

ipcMain.handle("get-taglist", async () => {
  const taglistPath = path.join(app.getPath("appData"), "clipx", "taglist.json");

  try {
    const data = await fs.promises.readFile(taglistPath, "utf-8");
    console.log(data);
    return JSON.parse(data);
  } catch (e) {
    if (e && e.code === "ENOENT") { // File does not exist so create it with default taglist
      const appDataDir = path.dirname(taglistPath);
      await fs.promises.mkdir(appDataDir, { recursive: true });
      await fs.promises.writeFile(taglistPath, "", "utf-8");

      console.log("ClipX: Created new taglist.json at", taglistPath);
      return [];
    }
    console.error("ClipX: Failed to read taglist.json:", e);
    return [];
  }
});

ipcMain.handle("save-taglist", async (_e, taglist) => {
  const taglistPath = path.join(app.getPath("appData"), "clipx", "taglist.json");

  try {
    const appDataDir = path.dirname(taglistPath);
    await fs.promises.mkdir(appDataDir, { recursive: true });
    await fs.promises.writeFile(taglistPath, JSON.stringify(taglist, null, 2), "utf-8");
  } catch (e) {
    console.error("ClipX: Failed to save taglist.json:", e);
    throw e;
  }
});

ipcMain.handle("search-games", async (_e, query) => {
  if (typeof query !== "string") {
    return [];
  }

  const headers = {
    "Client-ID": "31woiu66m2oeotccavjhhgaeg26jdg",
    "Authorization": "Bearer vkibr6jlgoaw8uh9bk9dgacdx14gjv",
    "Content-Type": "text/plain",
    "Accept": "application/json",
  };

  console.log("Searching games for query:", query);

  let response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: headers,
    body: `
      fields name,cover.url, cover.image_id, total_rating_count, first_release_date;
      search "${query}";
      where game_type = 0;
      limit 5;
    `
  });
  const data = await response.json();
  // filter out any game that does have a game_type of 0
  data.sort((a, b) => (b.total_rating_count || 0) - (a.total_rating_count || 0));
  console.log(data);

  return data;
});

ipcMain.handle("get-options", async () => {
  const optionsPath = path.join(app.getPath("appData"), "clipx", "options.json");

  try {
    const data = await fs.promises.readFile(optionsPath, "utf-8");
    console.log(data);
    return JSON.parse(data);
  } catch (e) {
    if (e && e.code === "ENOENT") { // File does not exist so create it with default options
      const appDataDir = path.dirname(optionsPath);
      await fs.promises.mkdir(appDataDir, {recursive: true});
      await fs.promises.writeFile(optionsPath, "", "utf-8");
      console.log("ClipX: Created options for query:", optionsPath);
      return {};
    }
    console.error("ClipX: Failed to read options.json:", e);
    return {};
  }
});

ipcMain.handle("save-options", async (_e, options) => {
  const optionsPath = path.join(app.getPath("appData"), "clipx", "options.json");

  try {
    const appDataDir = path.dirname(optionsPath);
    await fs.promises.mkdir(appDataDir, {recursive: true});
    await fs.promises.writeFile(optionsPath, JSON.stringify(options, null, 2), "utf-8");
    console.log("ClipX: Saved options.json at", optionsPath);
  } catch (e) {
    console.error("ClipX: Failed to save options.json:", e);
    throw e;
  }
});
