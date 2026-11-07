import crypto from "crypto";
import path from "path";

export const OBS_VERSION = "33.0.0";
export const OBS_ZIP_URL = `https://github.com/obsproject/obs-studio/releases/download/${OBS_VERSION}/OBS-Studio-${OBS_VERSION}-Windows-x64.zip`;
export const OBS_ZIP_SHA256 = "3369a3ecd67b5669a8a08d77357f87cc786d1fba42fbbd1054d841a69f6271a7";
export const OBS_PROFILE_NAME = "ClipX";
export const KEYFRAME_PADDING_SECONDS = 5;

const ENCODER_BY_GPU_VENDOR = {
  0x10de: "obs_nvenc_h264_tex",
  0x1002: "h264_texture_amf",
  0x8086: "obs_qsv11_v2",
};

export function pickEncoder(vendorId) {
  return ENCODER_BY_GPU_VENDOR[vendorId] || "obs_x264";
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

export function buildObsConfigFiles({ port, password, clipsDir, seconds, encoder, canvas, output, fps, bitrate, recTracks = 1 }) {
  const profileDir = path.join("basic", "profiles", OBS_PROFILE_NAME);

  return {
    "global.ini": toIni({
      General: { InfoLastVersion: "18446744073709551615", InfoIncrement: 2147483647 },
    }),
    "user.ini": toIni({
      General: { FirstRun: true },
      BasicWindow: { SysTrayEnabled: false },
    }),
    [path.join(profileDir, "basic.ini")]: toIni({
      General: { Name: OBS_PROFILE_NAME },
      Output: { Mode: "Advanced", FilenameFormatting: "%CCYY-%MM-%DD %hh-%mm-%ss" },
      SimpleOutput: { RecRBPrefix: "Clip" },
      AdvOut: {
        RecType: "Standard",
        RecFilePath: clipsDir.replace(/\\/g, "/"),
        RecFormat2: "mp4",
        RecEncoder: encoder,
        RecTracks: recTracks,
        RecRB: true,
        RecRBTime: seconds + KEYFRAME_PADDING_SECONDS,
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
    [path.join(profileDir, "recordEncoder.json")]: JSON.stringify({ rate_control: "CBR", bitrate: bitrate * 1000 }),
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
