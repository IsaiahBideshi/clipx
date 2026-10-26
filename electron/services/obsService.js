import { app, BrowserWindow, Notification, screen } from "electron";
import { execFile, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import net from "net";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";

import { upsertIndexedClip } from "./clipIndexService.js";
import { getCurrentGame, getGameForClip, setGameForCurrentExe, startGameDetection, stopGameDetection } from "./gameDetectionService.js";
import { getForegroundWindow } from "../utils/foregroundWindow.js";
import { isHotkeyDown, parseAccelerator } from "../utils/accelerator.js";
import { isKeyDown } from "../utils/keyState.js";
import {
  OBS_PROFILE_NAME,
  OBS_VERSION,
  OBS_ZIP_SHA256,
  OBS_ZIP_URL,
  buildObsConfigFiles,
  obsAuth,
  pickSimpleEncoder,
} from "../utils/obsConfig.js";
import {
  MAX_AUDIO_TRACKS,
  findMonitorItem,
  getEnabledScreens,
  getRecordingOptions,
  numberScreens,
  pickFollowScreen,
  planAudioTracks,
  planRecorders,
  toAudioTrackMap,
} from "../utils/recordingPlan.js";
import { CLIP_MANIFEST_NAME, buildClipManifest, getAudioTrackNames, getClipName } from "../utils/clipManifest.js";

const execFileAsync = promisify(execFile);

const REPLAYS_DIR_NAME = "ClipX Replays";
const STAGING_DIR_NAME = ".recording";
const RECORDERS_DIR_NAME = "recorders";
const DISPLAY_INPUT_NAME = "ClipX Display";
const DESKTOP_AUDIO_INPUT_NAME = "ClipX Desktop Audio";
const MIC_INPUT_NAME = "ClipX Microphone";
const APP_LIST_INPUT_NAME = "ClipX App List";
const CONNECT_TIMEOUT_MS = 30 * 1000;
const CONNECT_RETRY_MS = 500;
const SAVE_TIMEOUT_MS = 20 * 1000;
const FOLLOW_INTERVAL_MS = 500;
const HOTKEY_POLL_MS = 25;
const IDENTIFY_DURATION_MS = 2500;
const OUTPUTS_EVENT_SUBSCRIPTION = 1 << 6;

let latestState = { status: "off" };
let hotkeyError = null;
let hotkeyTimer = null;
let appliedOptions = null;
let requestedOptions = null;
let startupController = null;
let followTimer = null;
let saving = false;
let watchingDisplays = false;
let applyQueue = Promise.resolve();
const recorders = new Map();

function getScreens() {
  const primaryId = screen.getPrimaryDisplay().id;
  return numberScreens(screen.getAllDisplays().map((display) => {
    const bounds = screen.dipToScreenRect(null, display.bounds);
    return {
      id: display.id,
      label: display.label || "",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      primary: display.id === primaryId,
    };
  }));
}

function getSnapshot() {
  return {
    ...latestState,
    hotkeyError,
    screens: getScreens(),
    primaryScreenId: recorders.get("main")?.screenId ?? null,
    recorderCount: recorders.size,
    recordings: [...recorders.values()].map((recorder) => ({ role: recorder.plan.role, screenId: recorder.plan.screenId })),
    game: getCurrentGame(),
  };
}

function emitClippingState(state) {
  latestState = state;
  const snapshot = getSnapshot();

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("clipping:state", snapshot);
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

function getInstallRoot() {
  return path.join(getObsDir(), OBS_VERSION);
}

function getObsExePath() {
  return path.join(getInstallRoot(), "bin", "64bit", "obs64.exe");
}

function getRecorderRoot(key) {
  return path.join(getObsDir(), RECORDERS_DIR_NAME, key);
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
  await fs.promises.rm(getInstallRoot(), { recursive: true, force: true });
  await fs.promises.rename(extractDir, getInstallRoot());
  await fs.promises.rm(zipPath, { force: true });

  for (const entry of await fs.promises.readdir(obsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== OBS_VERSION && entry.name !== RECORDERS_DIR_NAME) {
      await fs.promises.rm(path.join(obsDir, entry.name), { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(getObsExePath())) {
    throw new Error("OBS was not installed correctly.");
  }
}

async function prepareRecorderRoot(key) {
  const root = getRecorderRoot(key);
  await fs.promises.mkdir(path.join(root, "bin", "64bit"), { recursive: true });

  for (const entry of await fs.promises.readdir(getInstallRoot())) {
    if (entry === "bin" || entry === "config") {
      continue;
    }
    const link = path.join(root, entry);
    await fs.promises.rm(link, { force: true });
    await fs.promises.symlink(path.join(getInstallRoot(), entry), link, "junction");
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

async function getEncoder() {
  const gpuInfo = await app.getGPUInfo("basic").catch(() => null);
  const gpu = gpuInfo?.gpuDevice?.find((device) => device.active) || gpuInfo?.gpuDevice?.[0];
  return pickSimpleEncoder(gpu?.vendorId);
}

async function writeRecorderConfig(recorder, options, connection, encoder) {
  const configDir = path.join(getRecorderRoot(recorder.key), "config", "obs-studio");
  const files = buildObsConfigFiles({
    ...connection,
    clipsDir: recorder.stagingDir,
    seconds: options.clipSeconds,
    encoder,
    canvas: recorder.plan.canvas,
    output: recorder.plan.output,
    fps: recorder.plan.fps,
    recTracks: recorder.plan.audio ? planAudioTracks(options.clipAudioTracks).recTracks : 1,
  });

  await fs.promises.mkdir(recorder.stagingDir, { recursive: true });
  await fs.promises.rm(path.join(configDir, ".sentinel"), { recursive: true, force: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(configDir, relativePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, contents, "utf-8");
  }
}

function closeRecorderSocket(recorder) {
  recorder.socket?.close();
  recorder.socket = null;

  for (const { reject } of recorder.pending.values()) {
    reject(new Error("OBS disconnected."));
  }
  recorder.pending.clear();
}

function handleRecorderEvent(recorder, { eventType, eventData }) {
  if (eventType === "ReplayBufferSaved") {
    recorder.saveWaiter?.resolve(eventData.savedReplayPath);
  }

  if (
    eventType === "ReplayBufferStateChanged" &&
    eventData.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED" &&
    latestState.status === "ready"
  ) {
    emitClippingState({ status: "error", message: "OBS stopped recording." });
  }
}

function openSocket(recorder, { port, password }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.onerror = () => reject(new Error("Could not connect to OBS."));
    ws.onclose = () => {
      reject(new Error("OBS closed the connection."));
      if (recorder.socket === ws) {
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
        recorder.socket = ws;
        resolve();
      } else if (op === 5) {
        handleRecorderEvent(recorder, d);
      } else if (op === 7) {
        const pending = recorder.pending.get(d.requestId);
        if (!pending) {
          return;
        }

        recorder.pending.delete(d.requestId);
        if (d.requestStatus.result) {
          pending.resolve(d.responseData || {});
        } else {
          pending.reject(new Error(d.requestStatus.comment || `${d.requestType} failed.`));
        }
      }
    };
  });
}

function recorderRequest(recorder, requestType, requestData = {}) {
  if (!recorder?.socket) {
    return Promise.reject(new Error("OBS is not connected."));
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    recorder.pending.set(requestId, { resolve, reject });
    recorder.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  });
}

async function connectRecorder(recorder, connection) {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;

  while (true) {
    try {
      if (!recorder.socket) {
        await openSocket(recorder, connection);
      }
      return await recorderRequest(recorder, "GetVersion");
    } catch (error) {
      if (!recorder.process || Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
    }
  }
}

function getFollowTargetId(options) {
  if (options.clipFollow === "focus") {
    try {
      const foreground = getForegroundWindow();
      if (foreground?.rect.width > 0) {
        return screen.getDisplayMatching(screen.screenToDipRect(null, foreground.rect)).id;
      }
    } catch (error) {
      console.error("ClipX: Failed to read the focused window:", error);
    }
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
}

async function pointRecorderAt(recorder, screenId) {
  const target = getScreens().find((candidate) => candidate.id === screenId);
  const item = target && findMonitorItem(recorder.monitorItems, target);
  if (!item) {
    return;
  }

  await recorderRequest(recorder, "SetInputSettings", {
    inputName: DISPLAY_INPUT_NAME,
    inputSettings: { monitor_id: item.itemValue },
  });
  recorder.screenId = screenId;
}

async function refreshMonitorItems(recorder) {
  const { propertyItems } = await recorderRequest(recorder, "GetInputPropertiesListPropertyItems", {
    inputName: DISPLAY_INPUT_NAME,
    propertyName: "monitor_id",
  });
  recorder.monitorItems = propertyItems;
}

function toWindowMatch(exe) {
  return exe ? `::${exe}` : "";
}

function getGameTrackExe() {
  return getCurrentGame()?.exe || "";
}

async function setupAudio(recorder, options, ensureInput, existingInputs) {
  const audio = planAudioTracks(options.clipAudioTracks);

  await ensureInput(DESKTOP_AUDIO_INPUT_NAME, "wasapi_output_capture");
  await recorderRequest(recorder, "SetInputAudioTracks", { inputName: DESKTOP_AUDIO_INPUT_NAME, inputAudioTracks: toAudioTrackMap(1) });

  await ensureInput(MIC_INPUT_NAME, "wasapi_input_capture");
  await recorderRequest(recorder, "SetInputMute", { inputName: MIC_INPUT_NAME, inputMuted: !audio.micTrack });
  await recorderRequest(recorder, "SetInputAudioTracks", { inputName: MIC_INPUT_NAME, inputAudioTracks: toAudioTrackMap(1, audio.micTrack) });

  for (let index = 2; index <= MAX_AUDIO_TRACKS + 1; index++) {
    const inputName = `ClipX Track ${index}`;
    const track = audio.tracks.find((candidate) => candidate.index === index && candidate.kind !== "mic");
    if (!track) {
      if (existingInputs.has(inputName)) {
        await recorderRequest(recorder, "RemoveInput", { inputName });
      }
      continue;
    }

    const exe = track.kind === "game" ? getGameTrackExe() : track.exe;
    await ensureInput(inputName, "wasapi_process_output_capture", { window: toWindowMatch(exe), priority: 2 });
    await recorderRequest(recorder, "SetInputAudioTracks", { inputName, inputAudioTracks: toAudioTrackMap(index) });
  }

  await applyVolumes(recorder, audio);
}

async function applyVolumes(recorder, audio) {
  for (const track of audio.tracks) {
    const inputName = track.kind === "mic" ? MIC_INPUT_NAME : `ClipX Track ${track.index}`;
    const volume = Math.min(Math.max(Number(track.volume ?? 100), 0), 100);
    await recorderRequest(recorder, "SetInputVolume", { inputName, inputVolumeMul: volume / 100 });
  }
}

async function setupRecorder(recorder, options) {
  const { inputs } = await recorderRequest(recorder, "GetInputList");
  const { currentProgramSceneName: sceneName } = await recorderRequest(recorder, "GetCurrentProgramScene");
  const existingInputs = new Set(inputs.map((input) => input.inputName));
  const ensureInput = async (inputName, inputKind, inputSettings = {}) => {
    if (!existingInputs.has(inputName)) {
      await recorderRequest(recorder, "CreateInput", { sceneName, inputName, inputKind, inputSettings });
      existingInputs.add(inputName);
    } else if (Object.keys(inputSettings).length) {
      await recorderRequest(recorder, "SetInputSettings", { inputName, inputSettings });
    }
  };

  await ensureInput(DISPLAY_INPUT_NAME, "monitor_capture");
  const { sceneItemId } = await recorderRequest(recorder, "GetSceneItemId", { sceneName, sourceName: DISPLAY_INPUT_NAME });
  await recorderRequest(recorder, "SetSceneItemTransform", {
    sceneName,
    sceneItemId,
    sceneItemTransform: {
      positionX: 0,
      positionY: 0,
      alignment: 5,
      boundsType: "OBS_BOUNDS_SCALE_INNER",
      boundsAlignment: 0,
      boundsWidth: recorder.plan.canvas.width,
      boundsHeight: recorder.plan.canvas.height,
    },
  });

  await refreshMonitorItems(recorder);
  await pointRecorderAt(recorder, recorder.plan.screenId ?? pickFollowScreen(
    getEnabledScreens(getScreens(), options.clipDisabledScreens),
    getFollowTargetId(options),
    null,
  ));

  if (recorder.plan.audio) {
    await setupAudio(recorder, options, ensureInput, existingInputs);
  }
}

async function launchRecorder(recorder, options, encoder, signal) {
  await prepareRecorderRoot(recorder.key);
  const connection = {
    port: await getFreePort(),
    password: crypto.randomBytes(24).toString("base64url"),
  };
  await writeRecorderConfig(recorder, options, connection, encoder);
  signal.throwIfAborted();

  const child = spawn(getObsExePath(), [
    "--portable",
    "--multi",
    "--disable-updater",
    "--disable-missing-files-check",
    "--profile",
    OBS_PROFILE_NAME,
  ], { cwd: path.join(getRecorderRoot(recorder.key), "bin", "64bit"), stdio: "ignore", windowsHide: true });
  recorder.process = child;

  const onChildStopped = () => {
    if (recorder.process === child) {
      handleObsLost("OBS stopped unexpectedly.");
    }
  };
  child.on("exit", onChildStopped);
  child.on("error", onChildStopped);

  await connectRecorder(recorder, connection);
  await setupRecorder(recorder, options);
  await recorderRequest(recorder, "StartReplayBuffer");
}

async function launchRecorders(options, signal) {
  signal.throwIfAborted();
  emitClippingState({ status: "starting" });

  const plan = planRecorders(getScreens(), options);
  if (!plan.length) {
    throw new Error("Turn on at least one screen to record.");
  }

  const stagingRoot = path.join(options.clipsFolder, REPLAYS_DIR_NAME, STAGING_DIR_NAME);
  await fs.promises.rm(stagingRoot, { recursive: true, force: true });
  const encoder = await getEncoder();

  for (const recorderPlan of plan) {
    recorders.set(recorderPlan.key, {
      key: recorderPlan.key,
      plan: recorderPlan,
      stagingDir: path.join(stagingRoot, recorderPlan.key),
      process: null,
      socket: null,
      pending: new Map(),
      screenId: recorderPlan.screenId,
      monitorItems: [],
      saveWaiter: null,
      switching: false,
    });
  }

  await Promise.all([...recorders.values()].map((recorder) => launchRecorder(recorder, options, encoder, signal)));
  signal.throwIfAborted();

  if (recorders.get("main")?.plan.screenId === null) {
    startFollowing();
  }
  emitClippingState({ status: "ready" });
}

function startFollowing() {
  stopFollowing();
  followTimer = setInterval(async () => {
    const main = recorders.get("main");
    if (!main || main.switching || latestState.status !== "ready") {
      return;
    }

    const enabled = getEnabledScreens(getScreens(), appliedOptions.clipDisabledScreens);
    const next = pickFollowScreen(enabled, getFollowTargetId(appliedOptions), main.screenId);
    if (next === main.screenId) {
      return;
    }

    main.switching = true;
    try {
      await pointRecorderAt(main, next);
      emitClippingState(latestState);
    } catch (error) {
      console.error("ClipX: Failed to switch the primary screen:", error);
    } finally {
      main.switching = false;
    }
  }, FOLLOW_INTERVAL_MS);
}

function stopFollowing() {
  clearInterval(followTimer);
  followTimer = null;
}

function stopObs() {
  startupController?.abort();
  startupController = null;
  stopFollowing();

  for (const recorder of recorders.values()) {
    const child = recorder.process;
    recorder.process = null;
    recorder.saveWaiter?.reject(new Error("Recording stopped."));
    closeRecorderSocket(recorder);
    child?.kill();
  }
  recorders.clear();
}

function handleObsLost(message) {
  const wasReady = latestState.status === "ready";
  stopObs();
  emitClippingState({ status: "error", message });

  if (wasReady && requestedOptions === appliedOptions) {
    queueApply(appliedOptions);
  }
}

function waitForSave(recorder) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      recorder.saveWaiter = null;
      reject(new Error("OBS took too long to save the clip."));
    }, SAVE_TIMEOUT_MS);

    recorder.saveWaiter = {
      resolve: (savedPath) => {
        clearTimeout(timer);
        recorder.saveWaiter = null;
        resolve(savedPath);
      },
      reject: (error) => {
        clearTimeout(timer);
        recorder.saveWaiter = null;
        reject(error);
      },
    };
    recorderRequest(recorder, "SaveReplayBuffer").catch((error) => recorder.saveWaiter?.reject(error));
  });
}

async function getUniqueDir(parentDir, name) {
  for (let attempt = 1; ; attempt++) {
    const dirName = attempt === 1 ? name : `${name} (${attempt})`;
    if (!fs.existsSync(path.join(parentDir, dirName))) {
      return dirName;
    }
  }
}

async function finalizeClip(createdAt, savedFiles, options) {
  const replaysDir = path.join(options.clipsFolder, REPLAYS_DIR_NAME);
  const game = options.clipDetectGame ? getGameForClip(options.clipSeconds) : null;
  const folderName = await getUniqueDir(replaysDir, getClipName(createdAt, game?.name));
  const clipDir = path.join(replaysDir, folderName);
  const screens = getScreens();
  const describeScreen = (screenId) => {
    const match = screens.find((candidate) => candidate.id === screenId);
    return match ? { number: match.number, label: match.label, width: match.width, height: match.height } : null;
  };

  const primary = savedFiles.find(({ recorder }) => recorder.key === "main");
  const secondaries = savedFiles
    .filter(({ recorder }) => recorder.key !== "main")
    .map((saved) => ({ ...saved, screen: describeScreen(saved.recorder.screenId) }))
    .filter((saved) => saved.screen);
  const follows = primary.recorder.plan.screenId === null;
  const manifest = buildClipManifest({
    folderName,
    createdAt: createdAt.toISOString(),
    seconds: options.clipSeconds,
    game,
    primary: {
      follows,
      screen: follows ? null : describeScreen(primary.recorder.screenId),
      audioTracks: getAudioTrackNames(planAudioTracks(options.clipAudioTracks).tracks),
    },
    secondaries,
  });

  await fs.promises.mkdir(clipDir, { recursive: true });
  await fs.promises.writeFile(path.join(clipDir, CLIP_MANIFEST_NAME), JSON.stringify(manifest, null, 2), "utf-8");

  const sources = [primary, ...secondaries];
  for (const [index, entry] of manifest.files.entries()) {
    const destination = path.join(clipDir, entry.file);
    await fs.promises.rename(sources[index].savedPath, destination);
    await upsertIndexedClip(options.clipsFolder, destination, { emitChange: entry.role === "primary" })
      .catch((error) => console.error("ClipX: Failed to index saved clip:", error));
  }

  return manifest;
}

async function saveClip() {
  if (latestState.status !== "ready") {
    showNotification("Clipping isn't ready", latestState.message || "OBS is still starting.");
    return;
  }
  if (saving) {
    return;
  }

  saving = true;
  const options = appliedOptions;
  const createdAt = new Date();
  try {
    const active = [...recorders.values()];
    const results = await Promise.allSettled(active.map((recorder) => waitForSave(recorder)));
    const savedFiles = results
      .map((result, index) => (result.status === "fulfilled" ? { recorder: active[index], savedPath: result.value } : null))
      .filter(Boolean);

    if (!savedFiles.some(({ recorder }) => recorder.key === "main")) {
      throw results[active.findIndex((recorder) => recorder.key === "main")].reason;
    }

    const manifest = await finalizeClip(createdAt, savedFiles, options);
    const screenCount = manifest.files.length;
    showNotification("Clip saved", [manifest.game?.name, screenCount > 1 ? `${screenCount} recordings` : null].filter(Boolean).join(" · ") || manifest.files[0].file);
  } catch (error) {
    console.error("ClipX: Failed to save clip:", error);
    showNotification("Clip failed", error?.message || "The clip could not be saved.");
  } finally {
    saving = false;
  }
}

function stopHotkey() {
  clearInterval(hotkeyTimer);
  hotkeyTimer = null;
}

function registerHotkey(accelerator) {
  stopHotkey();
  const hotkey = parseAccelerator(accelerator);
  hotkeyError = hotkey ? null : `${accelerator} isn't a valid hotkey.`;

  if (hotkey) {
    let wasDown = false;
    hotkeyTimer = setInterval(() => {
      const down = isHotkeyDown(hotkey, isKeyDown);
      if (down && !wasDown) {
        void saveClip();
      }
      wasDown = down;
    }, HOTKEY_POLL_MS);
  }

  emitClippingState(latestState);
}

async function onGameChange() {
  emitClippingState(latestState);

  const main = recorders.get("main");
  const gameTrack = planAudioTracks(appliedOptions?.clipAudioTracks).tracks.find((track) => track.kind === "game");
  if (!main?.socket || !gameTrack) {
    return;
  }

  await recorderRequest(main, "SetInputSettings", {
    inputName: `ClipX Track ${gameTrack.index}`,
    inputSettings: { window: toWindowMatch(getGameTrackExe()), priority: 2 },
  }).catch((error) => console.error("ClipX: Failed to point the game track at the new game:", error));
}

function syncGameDetection(options) {
  if (options.enabled && options.clipDetectGame) {
    startGameDetection({ onChange: () => void onGameChange() });
  } else {
    stopGameDetection();
  }
}

function watchDisplays() {
  if (watchingDisplays) {
    return;
  }
  watchingDisplays = true;

  const restartForNewScreens = () => {
    emitClippingState(latestState);
    if (recorders.size && appliedOptions?.enabled && requestedOptions === appliedOptions) {
      stopObs();
      queueApply(appliedOptions);
    }
  };
  screen.on("display-added", restartForNewScreens);
  screen.on("display-removed", restartForNewScreens);
  screen.on("display-metrics-changed", async () => {
    emitClippingState(latestState);
    for (const recorder of recorders.values()) {
      await refreshMonitorItems(recorder)
        .then(() => pointRecorderAt(recorder, recorder.screenId))
        .catch((error) => console.error("ClipX: Failed to refresh screens:", error));
    }
  });
}

function normalizeOptions(options) {
  return {
    ...getRecordingOptions(options),
    enabled: options?.clippingEnabled === true && Boolean(options?.clipsFolder),
    clipsFolder: options?.clipsFolder || "",
  };
}

function getLaunchKey(options) {
  return JSON.stringify([
    options.clipsFolder,
    options.clipSeconds,
    options.clipAutoSwitch,
    options.clipAutoSwitch ? null : String(options.clipPrimaryScreen),
    options.clipDisabledScreens.map(String).sort(),
    options.clipPrimaryHeight,
    options.clipPrimaryFps,
    options.clipSecondaryHeight,
    options.clipSecondaryFps,
    options.clipAudioTracks.map((track) => [track.kind, track.exe || null]),
  ]);
}

async function applyOptions(next) {
  const previous = appliedOptions;
  appliedOptions = next;

  if (!previous?.enabled || next.clipHotkey !== previous.clipHotkey) {
    registerHotkey(next.clipHotkey);
  }
  syncGameDetection(next);

  if (!recorders.size || getLaunchKey(next) !== getLaunchKey(previous)) {
    stopObs();
    const controller = new AbortController();
    startupController = controller;

    try {
      await ensureObsInstalled(controller.signal);
      await launchRecorders(next, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      throw error;
    }
  } else {
    await applyVolumes(recorders.get("main"), planAudioTracks(next.clipAudioTracks));
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
      stopObs();
      if (requestedOptions !== next) {
        return;
      }

      console.error("ClipX: Failed to apply clipping options:", error);
      emitClippingState({ status: "error", message: error?.message || "Clipping failed to start." });
    });
  return applyQueue;
}

export function getClippingState() {
  return getSnapshot();
}

export function applyClippingOptions(options) {
  watchDisplays();
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
  stopHotkey();
  hotkeyError = null;
  stopGameDetection();
  stopObs();
  emitClippingState({ status: "off" });
}

export async function listAudioApps() {
  const main = recorders.get("main");
  if (!main?.socket || latestState.status !== "ready") {
    return null;
  }

  const { currentProgramSceneName: sceneName } = await recorderRequest(main, "GetCurrentProgramScene");
  await recorderRequest(main, "CreateInput", {
    sceneName,
    inputName: APP_LIST_INPUT_NAME,
    inputKind: "wasapi_process_output_capture",
    sceneItemEnabled: false,
  });

  try {
    const { propertyItems } = await recorderRequest(main, "GetInputPropertiesListPropertyItems", {
      inputName: APP_LIST_INPUT_NAME,
      propertyName: "window",
    });
    const apps = new Map();
    for (const item of propertyItems) {
      const exe = item.itemValue.split(":").pop();
      if (exe && !apps.has(exe.toLowerCase())) {
        apps.set(exe.toLowerCase(), { exe, title: item.itemName.replace(/^\[[^\]]*\]:\s*/, "") });
      }
    }
    return [...apps.values()].sort((a, b) => a.exe.localeCompare(b.exe));
  } finally {
    await recorderRequest(main, "RemoveInput", { inputName: APP_LIST_INPUT_NAME }).catch(() => {});
  }
}

export async function setDetectedGame(game) {
  await setGameForCurrentExe(game);
  return getSnapshot();
}

export function identifyScreens() {
  const screens = getScreens();
  for (const display of screen.getAllDisplays()) {
    const number = screens.find((candidate) => candidate.id === display.id)?.number;
    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      show: false,
    });
    win.setIgnoreMouseEvents(true);
    win.once("ready-to-show", () => win.showInactive());
    void win.loadURL(`data:text/html,${encodeURIComponent(
      `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:transparent;font:600 240px 'Segoe UI',sans-serif;color:#fff;text-shadow:0 0 32px rgba(0,0,0,.85)">${number}</body>`,
    )}`);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }, IDENTIFY_DURATION_MS);
  }
}
