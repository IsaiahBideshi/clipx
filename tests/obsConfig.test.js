import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { buildObsConfigFiles, obsAuth, pickSimpleEncoder, scaleToHeight } from "../electron/utils/obsConfig.js";

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

test("scales the output down to the max height with even dimensions", () => {
  assert.deepEqual(scaleToHeight(2560, 1440, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(scaleToHeight(3440, 1440, 1080), { width: 2580, height: 1080 });
  assert.deepEqual(scaleToHeight(1366, 768, 1080), { width: 1366, height: 768 });
  assert.deepEqual(scaleToHeight(1281, 721, 1080), { width: 1280, height: 720 });
});

test("writes the replay buffer and websocket settings", () => {
  const files = buildObsConfigFiles({
    port: 4567,
    password: "pw",
    clipsDir: "C:\\Clips\\ClipX Replays",
    seconds: 30,
    encoder: "nvenc",
    baseWidth: 2560,
    baseHeight: 1440,
  });
  const profile = files[path.join("basic", "profiles", "ClipX", "basic.ini")];
  const websocket = JSON.parse(files[path.join("plugin_config", "obs-websocket", "config.json")]);

  assert.match(profile, /\[SimpleOutput\][^[]*RecRB=true/);
  assert.match(profile, /RecRBTime=35\n/);
  assert.match(profile, /FilePath=C:\/Clips\/ClipX Replays\n/);
  assert.match(profile, /OutputCX=1920\nOutputCY=1080\n/);
  assert.equal(websocket.server_enabled, true);
  assert.equal(websocket.server_port, 4567);
  assert.equal(websocket.server_password, "pw");
});
