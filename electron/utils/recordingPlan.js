export const QUALITY_HEIGHTS = [2160, 1440, 1080, 720, 480];
export const QUALITY_FPS = [60, 30];
export const MAX_AUDIO_TRACKS = 5;
export const MIN_CLIP_SECONDS = 5;
export const MAX_CLIP_SECONDS = 600;
export const DEFAULT_RECORDING_OPTIONS = {
  clipHotkey: "Alt+F8",
  clipSeconds: 30,
  clipAutoSwitch: true,
  clipFollow: "mouse",
  clipPrimaryScreen: null,
  clipDisabledScreens: [],
  clipPrimaryHeight: 1080,
  clipPrimaryFps: 60,
  clipSecondaryHeight: 720,
  clipSecondaryFps: 30,
  clipAudioTracks: [],
  clipDetectGame: true,
};
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
  return merged;
}

export function clampClipSeconds(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) {
    return DEFAULT_RECORDING_OPTIONS.clipSeconds;
  }
  return Math.min(Math.max(seconds, MIN_CLIP_SECONDS), MAX_CLIP_SECONDS);
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
    audio: true,
  };

  const secondaries = enabled.length > 1
    ? enabled
      .filter((screen) => follows || screen.id !== fixedPrimary.id)
      .map((screen) => ({
        key: `screen-${screen.id}`,
        role: "secondary",
        screenId: screen.id,
        canvas: { width: screen.width, height: screen.height },
        output: toOutputSize(screen.width, screen.height, recording.clipSecondaryHeight),
        fps: recording.clipSecondaryFps,
        audio: false,
      }))
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
  return {
    tracks: used,
    recTracks: used.reduce((mask, track) => mask | (1 << (track.index - 1)), 1),
    micTrack: used.find((track) => track.kind === "mic")?.index ?? null,
  };
}

export function toAudioTrackMap(...indexes) {
  const map = {};
  for (let index = 1; index <= MAX_AUDIO_TRACKS + 1; index++) {
    map[index] = indexes.includes(index);
  }
  return map;
}

export function findMonitorItem(items, screen) {
  const position = new RegExp(` @ ${screen.x},${screen.y}( |$)`);
  return items.find((item) => position.test(item.itemName)) || null;
}
