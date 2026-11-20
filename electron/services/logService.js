import { app, crashReporter, screen, shell } from "electron";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import { formatLogLine, redactLogText } from "../utils/logFormat.js";

const execFileAsync = promisify(execFile);

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const LOG_FILES = ["main.log", "main.old.log"];
const CONSOLE_LEVELS = { log: "info", info: "info", warn: "warn", error: "error" };
const RENDERER_LEVELS = { warning: "warn", error: "error" };
const OBS_LOGS_PER_RECORDER = 3;
const CRASH_DUMPS_TO_EXPORT = 3;

let logPath = null;
let logBytes = 0;

function getLogsDir() {
  return path.join(app.getPath("userData"), "logs");
}

function writeLog(level, source, args) {
  if (!logPath) {
    return;
  }

  try {
    const line = formatLogLine(level, source, args, os.homedir());
    const bytes = Buffer.byteLength(line);
    if (logBytes + bytes > MAX_LOG_BYTES) {
      fs.renameSync(logPath, path.join(getLogsDir(), LOG_FILES[1]));
      logBytes = 0;
    }
    fs.appendFileSync(logPath, line);
    logBytes += bytes;
  } catch {}
}

async function logSystemInfo() {
  const gpu = await app.getGPUInfo("basic").catch(() => null);
  console.info("ClipX: System:", {
    locale: app.getLocale(),
    displays: screen.getAllDisplays().map((display) => `${display.bounds.width}x${display.bounds.height} @${display.scaleFactor}x ${display.displayFrequency} Hz${display.id === screen.getPrimaryDisplay().id ? " (primary)" : ""}`),
    gpus: gpu?.gpuDevice?.map((device) => ({ vendorId: device.vendorId, deviceId: device.deviceId, active: device.active, driver: device.driverVersion })),
  });
}

export function startLogging() {
  fs.mkdirSync(getLogsDir(), { recursive: true });
  logPath = path.join(getLogsDir(), LOG_FILES[0]);
  logBytes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

  for (const [method, level] of Object.entries(CONSOLE_LEVELS)) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      writeLog(level, "main", args);
    };
  }

  crashReporter.start({ uploadToServer: false });

  process.on("uncaughtExceptionMonitor", (error) => writeLog("error", "main", ["Uncaught exception:", error]));
  process.on("unhandledRejection", (reason) => writeLog("error", "main", ["Unhandled rejection:", reason]));

  app.on("render-process-gone", (_event, contents, details) => console.error("ClipX: A window's renderer stopped:", contents.getURL(), details));
  app.on("child-process-gone", (_event, details) => console.error("ClipX: A child process stopped:", details));
  app.on("web-contents-created", (_event, contents) => {
    contents.on("console-message", ({ level, message, sourceId, lineNumber }) => {
      if (RENDERER_LEVELS[level]) {
        writeLog(RENDERER_LEVELS[level], "renderer", [`${message} (${sourceId}:${lineNumber})`]);
      }
    });
  });
  app.on("browser-window-created", (_event, window) => {
    window.on("unresponsive", () => console.warn("ClipX: A window stopped responding:", window.webContents.getURL()));
    window.on("responsive", () => console.info("ClipX: The window is responding again."));
  });
  app.on("will-quit", () => console.info("ClipX: Quitting."));

  console.info(`ClipX ${app.getVersion()} starting:`, {
    packaged: app.isPackaged,
    electron: process.versions.electron,
    windows: os.release(),
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    prerelease: process.env.CLIPX_ALLOW_PRERELEASE === "true",
  });
  app.whenReady().then(logSystemInfo).catch((error) => console.error("ClipX: Failed to log system info:", error));
}

async function listNewestFiles(dir, count, filter = () => true, { recursive = false } = {}) {
  const names = await fs.promises.readdir(dir, { recursive }).catch(() => []);
  const files = await Promise.all(names.filter(filter).map(async (name) => {
    const filePath = path.join(dir, name);
    const stats = await fs.promises.stat(filePath).catch(() => null);
    return stats?.isFile() ? { filePath, mtimeMs: stats.mtimeMs } : null;
  }));
  return files.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, count).map((file) => file.filePath);
}

async function copyRedacted(source, destination) {
  const text = await fs.promises.readFile(source, "utf-8");
  await fs.promises.writeFile(destination, redactLogText(text, os.homedir()), "utf-8");
}

export async function exportLogs() {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  const zipPath = path.join(app.getPath("downloads"), `ClipX-logs-${stamp}.zip`);
  const stagingDir = path.join(app.getPath("temp"), "clipx", `logs-${stamp}`);
  await fs.promises.mkdir(stagingDir, { recursive: true });

  try {
    for (const name of LOG_FILES) {
      await fs.promises.copyFile(path.join(getLogsDir(), name), path.join(stagingDir, name)).catch(() => {});
    }

    const optionsPath = path.join(app.getPath("appData"), "clipx", "options.json");
    await copyRedacted(optionsPath, path.join(stagingDir, "options.json")).catch(() => {});

    const recordersDir = path.join(app.getPath("userData"), "obs", "recorders");
    for (const key of await fs.promises.readdir(recordersDir).catch(() => [])) {
      const obsDir = path.join(recordersDir, key, "config", "obs-studio");
      for (const [kind, count] of [["logs", OBS_LOGS_PER_RECORDER], ["crashes", 1]]) {
        for (const filePath of await listNewestFiles(path.join(obsDir, kind), count)) {
          await copyRedacted(filePath, path.join(stagingDir, `obs-${key}-${kind}-${path.basename(filePath)}`));
        }
      }
    }

    const dumps = await listNewestFiles(app.getPath("crashDumps"), CRASH_DUMPS_TO_EXPORT, (name) => name.endsWith(".dmp"), { recursive: true });
    for (const filePath of dumps) {
      await fs.promises.copyFile(filePath, path.join(stagingDir, `crash-${path.basename(filePath)}`));
    }

    const tarPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    await execFileAsync(tarPath, ["-a", "-c", "-f", zipPath, "-C", stagingDir, ...await fs.promises.readdir(stagingDir)], { windowsHide: true });
  } finally {
    await fs.promises.rm(stagingDir, { recursive: true, force: true });
  }

  console.info("ClipX: Exported logs.");
  shell.showItemInFolder(zipPath);
  return zipPath;
}
