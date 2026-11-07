export const QUALITY_HEIGHTS = [2160, 1440, 1080, 720, 480];
export const QUALITY_FPS = [60, 30];
export const MAX_AUDIO_TRACKS = 4;
export const OBS_AUDIO_TRACKS = 6;
export const MIN_CLIP_SECONDS = 5;
export const MAX_CLIP_SECONDS = 600;
export const MIN_BITRATE_MBPS = 1;
export const MAX_BITRATE_MBPS = 100;
export const DEFAULT_RECORDING_OPTIONS = {
  clipHotkey: "Alt+F8",
  clipSeconds: 30,
  clipAutoSwitch: true,
  clipFollow: "mouse",
  clipPrimaryScreen: null,
  clipDisabledScreens: [],
  clipPrimaryHeight: 1080,
  clipPrimaryFps: 60,
  clipPrimaryBitrate: 20,
  clipSecondaryHeight: 720,
  clipSecondaryFps: 30,
  clipSecondaryBitrate: 6,
  clipAudioTracks: [],
  clipDetectGame: true,
  clipToastEnabled: true,
  clipToastCorner: "right",
  clipSoundEnabled: true,
  clipSoundVolume: 60,
};
const PROCESS_TREE_ROOTS = ["explorer.exe"];
const MAX_ENCODE_WIDTH = 4096;
const LOAD_UNIT = 1920 * 1080 * 60;

export function getRecordingOptions(options) {
  const merged = { ...DEFAULT_RECORDING_OPTIONS };
  for (const key of Object.keys(DEFAULT_RECORDING_OPTIONS)) {
    if (options?.[key] !== undefined && options[key] !== null) {
      merged[key] = options[key];
    }
  }
  merged.clipPrimaryScreen = options?.clipPrimaryScreen ?? null;
  merged.clipSeconds = clampClipSeconds(merged.clipSeconds);
  merged.clipPrimaryBitrate = clampBitrate(merged.clipPrimaryBitrate, DEFAULT_RECORDING_OPTIONS.clipPrimaryBitrate);
  merged.clipSecondaryBitrate = clampBitrate(merged.clipSecondaryBitrate, DEFAULT_RECORDING_OPTIONS.clipSecondaryBitrate);
  return merged;
}

function clampWholeNumber(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, min), max);
}

export function clampClipSeconds(value) {
  return clampWholeNumber(value, MIN_CLIP_SECONDS, MAX_CLIP_SECONDS, DEFAULT_RECORDING_OPTIONS.clipSeconds);
}

export function clampBitrate(value, fallback) {
  return clampWholeNumber(value, MIN_BITRATE_MBPS, MAX_BITRATE_MBPS, fallback);
}

export function toOutputSize(width, height, maxHeight) {
  const scale = Math.min(1, maxHeight / height, MAX_ENCODE_WIDTH / width);
  const toEven = (value) => Math.max(2, Math.floor((value * scale) / 2) * 2);
  return { width: toEven(width), height: toEven(height) };
}

export function numberScreens(screens) {
  return [...screens]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((screen, index) => ({ ...screen, number: index + 1 }));
}

export function getEnabledScreens(screens, disabledScreens = []) {
  const disabled = new Set(disabledScreens.map(String));
  return screens.filter((screen) => !disabled.has(String(screen.id)));
}

export function getFixedPrimaryScreen(enabledScreens, primaryScreenId) {
  return enabledScreens.find((screen) => String(screen.id) === String(primaryScreenId))
    || enabledScreens.find((screen) => screen.primary)
    || enabledScreens[0]
    || null;
}

export function planRecorders(screens, options) {
  const recording = getRecordingOptions(options);
  const enabled = getEnabledScreens(screens, recording.clipDisabledScreens);
  if (!enabled.length) {
    return [];
  }

  const follows = recording.clipAutoSwitch && enabled.length > 1;
  const fixedPrimary = getFixedPrimaryScreen(enabled, recording.clipPrimaryScreen);
  const mainCanvas = follows
    ? { width: Math.max(...enabled.map((screen) => screen.width)), height: Math.max(...enabled.map((screen) => screen.height)) }
    : { width: fixedPrimary.width, height: fixedPrimary.height };

  const main = {
    key: "main",
    role: "primary",
    screenId: follows ? null : fixedPrimary.id,
    canvas: mainCanvas,
    output: toOutputSize(mainCanvas.width, mainCanvas.height, recording.clipPrimaryHeight),
    fps: recording.clipPrimaryFps,
    bitrate: recording.clipPrimaryBitrate,
    audio: true,
  };

  const windowsPrimary = getFixedPrimaryScreen(enabled, null);
  const secondaries = enabled.length > 1
    ? enabled
      .filter((screen) => follows || screen.id !== fixedPrimary.id)
      .map((screen) => {
        const primaryQuality = follows && screen.id === windowsPrimary.id;
        return {
          key: `screen-${screen.id}`,
          role: "secondary",
          screenId: screen.id,
          canvas: { width: screen.width, height: screen.height },
          output: toOutputSize(screen.width, screen.height, primaryQuality ? recording.clipPrimaryHeight : recording.clipSecondaryHeight),
          fps: primaryQuality ? recording.clipPrimaryFps : recording.clipSecondaryFps,
          bitrate: primaryQuality ? recording.clipPrimaryBitrate : recording.clipSecondaryBitrate,
          audio: false,
        };
      })
    : [];

  return [main, ...secondaries];
}

export function pickFollowScreen(enabledScreens, targetScreenId, currentScreenId) {
  if (enabledScreens.some((screen) => screen.id === targetScreenId)) {
    return targetScreenId;
  }
  if (enabledScreens.some((screen) => screen.id === currentScreenId)) {
    return currentScreenId;
  }
  return enabledScreens[0]?.id ?? null;
}

export function getDuplicateScreen(main, recorders, screens, clipStartMs) {
  if (main?.plan.screenId !== null || !(main.screenSince <= clipStartMs)) {
    return null;
  }

  const shown = screens.find((screen) => screen.id === main.screenId);
  const copy = recorders.find((recorder) => recorder.plan.role === "secondary" && recorder.screenId === main.screenId);
  if (!shown || !copy) {
    return null;
  }

  const { width, height } = main.plan.canvas;
  const fit = Math.min(width / shown.width, height / shown.height);
  const mainHeight = (shown.height * fit * main.plan.output.height) / height;
  const mainIsBetter = mainHeight >= copy.plan.output.height && main.plan.fps >= copy.plan.fps && main.plan.bitrate >= copy.plan.bitrate;
  const copyIsBetter = copy.plan.output.height >= mainHeight && copy.plan.fps >= main.plan.fps && copy.plan.bitrate >= main.plan.bitrate;
  if (mainIsBetter && shown.width * height === shown.height * width) {
    return { screenId: shown.id, keep: "main" };
  }
  return copyIsBetter ? { screenId: shown.id, keep: "screen" } : null;
}

export function describeRecorders(recorders) {
  const screens = (count) => `${count} ${count === 1 ? "screen" : "screens"}`;
  const secondaryCount = recorders.filter((recorder) => recorder.role === "secondary").length;
  const follows = recorders.some((recorder) => recorder.role === "primary" && recorder.screenId === null);
  if (follows) {
    return `1 following you + ${screens(secondaryCount)}`;
  }
  return screens(recorders.length);
}

export function estimateLoad(recorders) {
  const load = recorders.reduce((total, recorder) => total + (recorder.output.width * recorder.output.height * recorder.fps) / LOAD_UNIT, 0);
  if (load <= 1.2) return "Light";
  if (load <= 2.5) return "Moderate";
  return "Heavy";
}

export function planAudioTracks(tracks = []) {
  const used = tracks.slice(0, MAX_AUDIO_TRACKS).map((track, index) => ({ ...track, index: index + 2 }));
  const restTrack = used.length ? used.length + 2 : null;
  const hasAppTracks = used.some((track) => track.kind !== "mic");
  return {
    tracks: used,
    recTracks: [...used.map((track) => track.index), restTrack ?? 1].reduce((mask, index) => mask | (1 << (index - 1)), 1),
    micTrack: used.find((track) => track.kind === "mic")?.index ?? null,
    desktopTrack: hasAppTracks ? null : restTrack,
    otherAppsTrack: hasAppTracks ? restTrack : null,
  };
}

export function pickOtherAudioApps(windowExes, trackedExes, processes) {
  const toKey = (exe) => String(exe || "").toLowerCase();
  const tracked = new Set(trackedExes.map(toKey));
  const windowed = new Set(windowExes.map(toKey));
  const processByPid = new Map(processes.map((process) => [process.pid, process]));
  const blocked = new Set(PROCESS_TREE_ROOTS);

  for (const process of processes) {
    const exe = toKey(process.exeName);
    if (!windowed.has(exe) && !tracked.has(exe)) {
      continue;
    }

    const visited = new Set([process.pid]);
    let parent = processByPid.get(process.parentPid);
    while (parent && !visited.has(parent.pid)) {
      visited.add(parent.pid);
      const parentExe = toKey(parent.exeName);
      if (parentExe !== exe) {
        blocked.add(parentExe);
        if (tracked.has(parentExe)) {
          blocked.add(exe);
        }
      }
      parent = processByPid.get(parent.parentPid);
    }
  }

  const picked = new Map();
  for (const exe of windowExes) {
    const key = toKey(exe);
    if (!tracked.has(key) && !blocked.has(key)) {
      picked.set(key, exe);
    }
  }
  return [...picked.values()];
}

export function toAudioTrackMap(...indexes) {
  const map = {};
  for (let index = 1; index <= OBS_AUDIO_TRACKS; index++) {
    map[index] = indexes.includes(index);
  }
  return map;
}

export function findMonitorItem(items, screen) {
  const position = new RegExp(` @ ${screen.x},${screen.y}( |$)`);
  return items.find((item) => position.test(item.itemName)) || null;
}
