import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { buildObsConfigFiles, obsAuth, pickEncoder } from "../electron/utils/obsConfig.js";

test("builds the obs-websocket auth string from the password, salt and challenge", () => {
  const secret = crypto.createHash("sha256").update("secret" + "salt").digest("base64");
  const expected = crypto.createHash("sha256").update(secret + "challenge").digest("base64");
  assert.equal(obsAuth("secret", "salt", "challenge"), expected);
});

test("picks the OBS encoder for the GPU vendor", () => {
  assert.equal(pickEncoder(0x10de), "obs_nvenc_h264_tex");
  assert.equal(pickEncoder(0x1002), "h264_texture_amf");
  assert.equal(pickEncoder(0x8086), "obs_qsv11_v2");
  assert.equal(pickEncoder(undefined), "obs_x264");
});

test("writes the replay buffer, video and websocket settings", () => {
  const files = buildObsConfigFiles({
    port: 4567,
    password: "pw",
    clipsDir: "C:\\Clips\\ClipX Replays",
    seconds: 30,
    encoder: "obs_nvenc_h264_tex",
    canvas: { width: 2560, height: 1440 },
    output: { width: 1920, height: 1080 },
    fps: 30,
    bitrate: 25,
    recTracks: 0b111,
  });
  const profile = files[path.join("basic", "profiles", "ClipX", "basic.ini")];
  assert.match(files["user.ini"], /\[BasicWindow\]\nSysTrayEnabled=false\n/);
  const websocket = JSON.parse(files[path.join("plugin_config", "obs-websocket", "config.json")]);

  const encoderSettings = JSON.parse(files[path.join("basic", "profiles", "ClipX", "recordEncoder.json")]);

  assert.match(profile, /Mode=Advanced\n/);
  assert.match(profile, /\[AdvOut\][^[]*RecRB=true/);
  assert.match(profile, /RecEncoder=obs_nvenc_h264_tex\n/);
  assert.match(profile, /RecRBTime=35\n/);
  assert.match(profile, /RecFilePath=C:\/Clips\/ClipX Replays\n/);
  assert.match(profile, /BaseCX=2560\nBaseCY=1440\nOutputCX=1920\nOutputCY=1080\n/);
  assert.match(profile, /FPSCommon=30\n/);
  assert.match(profile, /RecTracks=7\n/);
  assert.deepEqual(encoderSettings, { rate_control: "CBR", bitrate: 25000 });
  assert.equal(websocket.server_enabled, true);
  assert.equal(websocket.server_port, 4567);
  assert.equal(websocket.server_password, "pw");
});
