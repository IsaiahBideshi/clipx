import { app, BrowserWindow, globalShortcut, Notification, screen } from "electron";
import { execFile, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import net from "net";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";

import { upsertIndexedClip } from "./clipIndexService.js";
import {
  OBS_PROFILE_NAME,
  OBS_VERSION,
  OBS_ZIP_SHA256,
  OBS_ZIP_URL,
  buildObsConfigFiles,
  obsAuth,
  pickSimpleEncoder,
} from "../utils/obsConfig.js";

const execFileAsync = promisify(execFile);

const DEFAULT_CLIP_HOTKEY = "Alt+F8";
const DEFAULT_CLIP_SECONDS = 30;
const REPLAYS_DIR_NAME = "ClipX Replays";
const DISPLAY_INPUT_NAME = "ClipX Display";
const CAPTURE_INPUTS = [
  { inputName: DISPLAY_INPUT_NAME, inputKind: "monitor_capture" },
  { inputName: "ClipX Desktop Audio", inputKind: "wasapi_output_capture" },
  { inputName: "ClipX Microphone", inputKind: "wasapi_input_capture" },
];
const CONNECT_TIMEOUT_MS = 30 * 1000;
const CONNECT_RETRY_MS = 500;
const OUTPUTS_EVENT_SUBSCRIPTION = 1 << 6;

let latestState = { status: "off" };
let hotkeyError = null;
let registeredHotkey = null;
let appliedOptions = null;
let requestedOptions = null;
let startupController = null;
let obsProcess = null;
let socket = null;
let applyQueue = Promise.resolve();
const pendingRequests = new Map();

function emitClippingState(state) {
  latestState = { ...state, hotkeyError };

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("clipping:state", latestState);
    }
  }
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function getObsDir() {
  return path.join(app.getPath("userData"), "obs");
}

function getObsRoot() {
  return path.join(getObsDir(), OBS_VERSION);
}

function getObsExePath() {
  return path.join(getObsRoot(), "bin", "64bit", "obs64.exe");
}

async function ensureObsInstalled(signal) {
  if (fs.existsSync(getObsExePath())) {
    return;
  }

  const obsDir = getObsDir();
  const zipPath = path.join(obsDir, "download.zip");
  const extractDir = path.join(obsDir, `tmp-${OBS_VERSION}`);
  await fs.promises.mkdir(obsDir, { recursive: true });
  emitClippingState({ status: "installing", progress: 0 });

  const response = await fetch(OBS_ZIP_URL, { signal });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download OBS (${response.status}).`);
  }

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  const hash = crypto.createHash("sha256");
  let receivedBytes = 0;
  let lastProgress = 0;

  await pipeline(
    Readable.fromWeb(response.body),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        receivedBytes += chunk.length;
        const progress = totalBytes ? Math.floor((receivedBytes / totalBytes) * 100) : 0;
        if (progress !== lastProgress) {
          lastProgress = progress;
          emitClippingState({ status: "installing", progress });
        }
        yield chunk;
      }
    },
    fs.createWriteStream(zipPath),
    { signal },
  );
  signal.throwIfAborted();

  if (hash.digest("hex") !== OBS_ZIP_SHA256) {
    await fs.promises.rm(zipPath, { force: true });
    throw new Error("The OBS download was corrupted. Try again.");
  }

  emitClippingState({ status: "installing", progress: 100 });
  await fs.promises.rm(extractDir, { recursive: true, force: true });
  await fs.promises.mkdir(extractDir, { recursive: true });
  const tarPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  await execFileAsync(tarPath, ["-xf", zipPath, "-C", extractDir], { signal });
  await fs.promises.rm(getObsRoot(), { recursive: true, force: true });
  await fs.promises.rename(extractDir, getObsRoot());
  await fs.promises.rm(zipPath, { force: true });

  for (const entry of await fs.promises.readdir(obsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== OBS_VERSION) {
      await fs.promises.rm(path.join(obsDir, entry.name), { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(getObsExePath())) {
    throw new Error("OBS was not installed correctly.");
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function writeObsConfig(options, connection) {
  const configDir = path.join(getObsRoot(), "config", "obs-studio");
  const clipsDir = path.join(options.clipsFolder, REPLAYS_DIR_NAME);
  const display = screen.getPrimaryDisplay();
  const gpuInfo = await app.getGPUInfo("basic").catch(() => null);
  const gpu = gpuInfo?.gpuDevice?.find((device) => device.active) || gpuInfo?.gpuDevice?.[0];

  const files = buildObsConfigFiles({
    ...connection,
    clipsDir,
    seconds: options.clipSeconds,
    encoder: pickSimpleEncoder(gpu?.vendorId),
    baseWidth: Math.round(display.size.width * display.scaleFactor),
    baseHeight: Math.round(display.size.height * display.scaleFactor),
  });

  await fs.promises.mkdir(clipsDir, { recursive: true });
  await fs.promises.rm(path.join(configDir, ".sentinel"), { recursive: true, force: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(configDir, relativePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, contents, "utf-8");
  }
}

function closeSocket() {
  socket?.close();
  socket = null;

  for (const { reject } of pendingRequests.values()) {
    reject(new Error("OBS disconnected."));
  }
  pendingRequests.clear();
}

function handleObsEvent({ eventType, eventData }) {
  if (eventType === "ReplayBufferSaved") {
    void onReplaySaved(eventData.savedReplayPath);
  }

  if (
    eventType === "ReplayBufferStateChanged" &&
    eventData.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED" &&
    latestState.status === "ready"
  ) {
    emitClippingState({ status: "error", message: "OBS stopped recording." });
  }
}

function openSocket({ port, password }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.onerror = () => reject(new Error("Could not connect to OBS."));
    ws.onclose = () => {
      reject(new Error("OBS closed the connection."));
      if (socket === ws) {
        handleObsLost("Lost the connection to OBS.");
      }
    };
    ws.onmessage = (event) => {
      const { op, d } = JSON.parse(event.data);

      if (op === 0) {
        ws.send(JSON.stringify({
          op: 1,
          d: {
            rpcVersion: 1,
            eventSubscriptions: OUTPUTS_EVENT_SUBSCRIPTION,
            authentication: d.authentication
              ? obsAuth(password, d.authentication.salt, d.authentication.challenge)
              : undefined,
          },
        }));
      } else if (op === 2) {
        socket = ws;
        resolve();
      } else if (op === 5) {
        handleObsEvent(d);
      } else if (op === 7) {
        const pending = pendingRequests.get(d.requestId);
        if (!pending) {
          return;
        }

        pendingRequests.delete(d.requestId);
        if (d.requestStatus.result) {
          pending.resolve(d.responseData || {});
        } else {
          pending.reject(new Error(d.requestStatus.comment || `${d.requestType} failed.`));
        }
      }
    };
  });
}

async function connectObs(connection) {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;

  while (true) {
    try {
      if (!socket) {
        await openSocket(connection);
      }
      return await obsRequest("GetVersion");
    } catch (error) {
      if (!obsProcess || Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
    }
  }
}

function obsRequest(requestType, requestData = {}) {
  if (!socket) {
    return Promise.reject(new Error("OBS is not connected."));
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  });
}

async function setupCapture() {
  const { inputs } = await obsRequest("GetInputList");
  const { currentProgramSceneName } = await obsRequest("GetCurrentProgramScene");
  for (const input of CAPTURE_INPUTS) {
    if (!inputs.some((existing) => existing.inputName === input.inputName)) {
      await obsRequest("CreateInput", { sceneName: currentProgramSceneName, ...input });
    }
  }

  const { propertyItems } = await obsRequest("GetInputPropertiesListPropertyItems", {
    inputName: DISPLAY_INPUT_NAME,
    propertyName: "monitor_id",
  });
  const primaryMonitor = propertyItems.find((item) => / @ 0,0( |$)/.test(item.itemName)) || propertyItems[0];
  if (primaryMonitor) {
    await obsRequest("SetInputSettings", {
      inputName: DISPLAY_INPUT_NAME,
      inputSettings: { monitor_id: primaryMonitor.itemValue },
    });
  }
}

async function applyMicSetting(recordMic) {
  const { inputs } = await obsRequest("GetInputList", { inputKind: "wasapi_input_capture" });
  for (const input of inputs) {
    await obsRequest("SetInputMute", { inputName: input.inputName, inputMuted: !recordMic });
  }
}

async function launchObs(options, signal) {
  signal.throwIfAborted();
  emitClippingState({ status: "starting" });

  const connection = {
    port: await getFreePort(),
    password: crypto.randomBytes(24).toString("base64url"),
  };
  await writeObsConfig(options, connection);
  signal.throwIfAborted();

  const child = spawn(getObsExePath(), [
    "--portable",
    "--multi",
    "--minimize-to-tray",
    "--disable-updater",
    "--disable-missing-files-check",
    "--profile",
    OBS_PROFILE_NAME,
  ], { cwd: path.dirname(getObsExePath()), stdio: "ignore" });
  obsProcess = child;

  const onChildStopped = () => {
    if (obsProcess === child) {
      handleObsLost("OBS stopped unexpectedly.");
    }
  };
  child.on("exit", onChildStopped);
  child.on("error", onChildStopped);

  await connectObs(connection);
  await setupCapture();
  await applyMicSetting(options.clipRecordMic);
  await obsRequest("StartReplayBuffer");
  signal.throwIfAborted();
  emitClippingState({ status: "ready" });
}

function stopObs() {
  startupController?.abort();
  startupController = null;

  const child = obsProcess;
  obsProcess = null;
  closeSocket();
  child?.kill();
}

function handleObsLost(message) {
  const wasReady = latestState.status === "ready";
  stopObs();
  emitClippingState({ status: "error", message });

  if (wasReady && requestedOptions === appliedOptions) {
    queueApply(appliedOptions);
  }
}

async function onReplaySaved(savedReplayPath) {
  try {
    await upsertIndexedClip(appliedOptions.clipsFolder, savedReplayPath, { emitChange: true });
  } catch (error) {
    console.error("ClipX: Failed to index saved clip:", error);
  }

  showNotification("Clip saved", path.basename(savedReplayPath));
}

async function saveClip() {
  if (latestState.status !== "ready") {
    showNotification("Clipping isn't ready", latestState.message || "OBS is still starting.");
    return;
  }

  try {
    await obsRequest("SaveReplayBuffer");
  } catch (error) {
    showNotification("Clip failed", error.message);
  }
}

function registerHotkey(accelerator) {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }
  hotkeyError = null;

  if (accelerator) {
    try {
      if (globalShortcut.register(accelerator, () => void saveClip())) {
        registeredHotkey = accelerator;
      } else {
        hotkeyError = `${accelerator} is already used by another app.`;
      }
    } catch {
      hotkeyError = `${accelerator} isn't a valid hotkey.`;
    }
  }

  emitClippingState(latestState);
}

function normalizeOptions(options) {
  return {
    enabled: options?.clippingEnabled === true && Boolean(options?.clipsFolder),
    clipsFolder: options?.clipsFolder || "",
    clipHotkey: options?.clipHotkey || DEFAULT_CLIP_HOTKEY,
    clipSeconds: Number(options?.clipSeconds) || DEFAULT_CLIP_SECONDS,
    clipRecordMic: options?.clipRecordMic === true,
  };
}

async function applyOptions(next) {
  const previous = appliedOptions;
  appliedOptions = next;

  if (!previous?.enabled || next.clipHotkey !== previous.clipHotkey) {
    registerHotkey(next.clipHotkey);
  }

  if (!obsProcess || next.clipsFolder !== previous.clipsFolder || next.clipSeconds !== previous.clipSeconds) {
    stopObs();
    const controller = new AbortController();
    startupController = controller;

    try {
      await ensureObsInstalled(controller.signal);
      await launchObs(next, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      throw error;
    }
  } else if (next.clipRecordMic !== previous.clipRecordMic) {
    await applyMicSetting(next.clipRecordMic);
  }
}

function queueApply(next) {
  requestedOptions = next;
  applyQueue = applyQueue
    .then(() => {
      if (requestedOptions === next) {
        return applyOptions(next);
      }
    })
    .catch((error) => {
      if (requestedOptions !== next) {
        return;
      }

      console.error("ClipX: Failed to apply clipping options:", error);
      stopObs();
      emitClippingState({ status: "error", message: error?.message || "Clipping failed to start." });
    });
  return applyQueue;
}

export function getClippingState() {
  return latestState;
}

export function applyClippingOptions(options) {
  const next = normalizeOptions(options);
  if (next.enabled) {
    return queueApply(next);
  }

  requestedOptions = next;
  if (appliedOptions?.enabled) {
    stopClipping();
  }
  appliedOptions = next;
  return applyQueue;
}

export function stopClipping() {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }
  hotkeyError = null;
  stopObs();
  emitClippingState({ status: "off" });
}
