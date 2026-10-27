import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { buildObsConfigFiles, obsAuth, pickSimpleEncoder } from "../electron/utils/obsConfig.js";

test("builds the obs-websocket auth string from the password, salt and challenge", () => {
  const secret = crypto.createHash("sha256").update("secret" + "salt").digest("base64");
  const expected = crypto.createHash("sha256").update(secret + "challenge").digest("base64");
  assert.equal(obsAuth("secret", "salt", "challenge"), expected);
});

test("picks the OBS simple-mode encoder for the GPU vendor", () => {
  assert.equal(pickSimpleEncoder(0x10de), "nvenc");
  assert.equal(pickSimpleEncoder(0x1002), "amd");
  assert.equal(pickSimpleEncoder(0x8086), "qsv");
  assert.equal(pickSimpleEncoder(undefined), "x264");
});

test("writes the replay buffer, video and websocket settings", () => {
  const files = buildObsConfigFiles({
    port: 4567,
    password: "pw",
    clipsDir: "C:\\Clips\\ClipX Replays",
    seconds: 30,
    encoder: "nvenc",
    canvas: { width: 2560, height: 1440 },
    output: { width: 1920, height: 1080 },
    fps: 30,
    recTracks: 0b111,
  });
  const profile = files[path.join("basic", "profiles", "ClipX", "basic.ini")];
  assert.match(files["user.ini"], /\[BasicWindow\]\nSysTrayEnabled=false\n/);
  const websocket = JSON.parse(files[path.join("plugin_config", "obs-websocket", "config.json")]);

  assert.match(profile, /\[SimpleOutput\][^[]*RecRB=true/);
  assert.match(profile, /RecRBTime=35\n/);
  assert.match(profile, /FilePath=C:\/Clips\/ClipX Replays\n/);
  assert.match(profile, /BaseCX=2560\nBaseCY=1440\nOutputCX=1920\nOutputCY=1080\n/);
  assert.match(profile, /FPSCommon=30\n/);
  assert.match(profile, /RecTracks=7\n/);
  assert.equal(websocket.server_enabled, true);
  assert.equal(websocket.server_port, 4567);
  assert.equal(websocket.server_password, "pw");
});
