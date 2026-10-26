import crypto from "crypto";
import path from "path";

export const OBS_VERSION = "33.0.0";
export const OBS_ZIP_URL = `https://github.com/obsproject/obs-studio/releases/download/${OBS_VERSION}/OBS-Studio-${OBS_VERSION}-Windows-x64.zip`;
export const OBS_ZIP_SHA256 = "3369a3ecd67b5669a8a08d77357f87cc786d1fba42fbbd1054d841a69f6271a7";
export const OBS_PROFILE_NAME = "ClipX";
const KEYFRAME_PADDING_SECONDS = 5;

const ENCODER_BY_GPU_VENDOR = {
  0x10de: "nvenc",
  0x1002: "amd",
  0x8086: "qsv",
};

export function pickSimpleEncoder(vendorId) {
  return ENCODER_BY_GPU_VENDOR[vendorId] || "x264";
}

export function obsAuth(password, salt, challenge) {
  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("base64");
  return sha256(sha256(password + salt) + challenge);
}

export function toIni(sections) {
  return Object.entries(sections)
    .map(([section, values]) => [
      `[${section}]`,
      ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    ].join("\n"))
    .join("\n\n") + "\n";
}

export function buildObsConfigFiles({ port, password, clipsDir, seconds, encoder, canvas, output, fps, recTracks = 1 }) {
  const bufferSeconds = seconds + KEYFRAME_PADDING_SECONDS;
  const megabytesPerSecond = Math.max(8, Math.ceil((8 * output.width * output.height * fps) / (1920 * 1080 * 60)));

  return {
    "global.ini": toIni({
      General: { InfoLastVersion: "18446744073709551615", InfoIncrement: 2147483647 },
    }),
    "user.ini": toIni({
      General: { FirstRun: true },
      BasicWindow: { SysTrayEnabled: false },
    }),
    [path.join("basic", "profiles", OBS_PROFILE_NAME, "basic.ini")]: toIni({
      General: { Name: OBS_PROFILE_NAME },
      Output: { Mode: "Simple", FilenameFormatting: "%CCYY-%MM-%DD %hh-%mm-%ss" },
      SimpleOutput: {
        RecRB: true,
        RecRBTime: bufferSeconds,
        RecRBSize: bufferSeconds * megabytesPerSecond,
        RecRBPrefix: "Clip",
        FilePath: clipsDir.replace(/\\/g, "/"),
        RecFormat2: "mp4",
        RecQuality: "Small",
        RecEncoder: encoder,
        RecTracks: recTracks,
      },
      Video: {
        BaseCX: canvas.width,
        BaseCY: canvas.height,
        OutputCX: output.width,
        OutputCY: output.height,
        FPSType: 0,
        FPSCommon: fps,
      },
    }),
    [path.join("plugin_config", "obs-websocket", "config.json")]: JSON.stringify({
      alerts_enabled: false,
      auth_required: true,
      first_load: false,
      server_enabled: true,
      server_password: password,
      server_port: port,
    }, null, 2),
  };
}
