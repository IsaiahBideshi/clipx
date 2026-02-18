import {app, BrowserWindow, dialog, ipcMain, protocol, shell} from "electron";
import http from "http";
import url, {fileURLToPath} from "url";
import keytar from "keytar";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegPath);

const SERVICE = "ClipX";
const ACCOUNT = "youtube_refresh_token";

async function storeRefreshToken(token) {
  await keytar.setPassword(SERVICE, ACCOUNT, token);
}
async function getRefreshToken() {
  return await keytar.getPassword(SERVICE, ACCOUNT);
}
async function deleteRefreshToken() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

async function getAccessToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token found");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Failed to refresh access token: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

const clientId = "170688170367-cesbl36crdh2qk3up02egjduffq4nepe.apps.googleusercontent.com";
const clientSecret = "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";

async function exchangeCodeForTokens(code) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `http://127.0.0.1:51723`,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();
  await storeRefreshToken(data.refresh_token);
}

async function getGoogleUserInfo(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    }
  });
  return await response.json();
}

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

ipcMain.handle("save-clip", async (_e, options) => {
  const clip = options.clip;

  let videoPath = clip.path;
  let startTime = options.start;
  let endTime = options.end;
  let clipTitle = options.title || "Untitled Clip " + Date.now();

  if (!videoPath || typeof videoPath !== "string") {
    throw new TypeError("save-clip: videoPath must be a non-empty string");
  }
  if (typeof startTime !== "number" || typeof endTime !== "number" || startTime < 0 || endTime <= startTime) {
    throw new TypeError("save-clip: Invalid startTime or endTime");
  }

  const sourceDir = path.dirname(videoPath);
  const outputDir = path.join(sourceDir, "ClipX Videos");
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${clipTitle}.mp4`);

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  // Optional extra safety check:
  const stat = await fs.promises.stat(outputPath);
  if (!stat.size) throw new Error("Output file is empty");

  return 200;
});

ipcMain.handle("link-youtube", async () => {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    const accessToken = await getAccessToken();
    const userInfo = await getGoogleUserInfo(accessToken);
    console.log("Linked YouTube account:", userInfo);
    return userInfo;
  }
  const port = 51723;

  return await new Promise(async (resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const queryObject = url.parse(req.url, true).query;
      try {
        if (queryObject.code) {
          res.end("You can close this window now.");
          server.close();

          await exchangeCodeForTokens(queryObject.code);
          const accessToken = await getAccessToken();
          const userInfo = await getGoogleUserInfo(accessToken);
          console.log("Linked YouTube account:", userInfo);
          resolve(userInfo);
        } else if (queryObject.error) {
          res.end("Authorization failed.");
          server.close();
          resolve(null);
        }
      } catch (e) {
        server.close();
        console.error(e);
        reject(e);
      }
    });

    server.listen(port);


    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `http://127.0.0.1:${port}`,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      access_type: "offline",
      prompt: "consent"
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    await shell.openExternal(authUrl);
  })
});

ipcMain.handle("unlink-youtube", async () => {
  await deleteRefreshToken();
});

ipcMain.handle("get-google-info", async () => {
  try {
    const accessToken = await getAccessToken();
    const userInfo = await getGoogleUserInfo(accessToken);
    return userInfo;
  } catch (e) {
    console.error("Failed to get Google info:", e);
    return null;
  }
});
