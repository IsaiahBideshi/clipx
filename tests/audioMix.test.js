import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAudioOutputOptions, buildMix, getMixTracks } from "../electron/utils/audioMix.js";

const tracks = [
  { index: 1, name: "Full mix", kind: "mix" },
  { index: 2, name: "Microphone", kind: "mic" },
  { index: 3, name: "Discord.exe", kind: "app" },
  { index: 4, name: "Other apps", kind: "other" },
];

test("only offers the mixer when every track has a kind", () => {
  assert.deepEqual(getMixTracks(tracks).map((track) => track.index), [2, 3, 4]);
  assert.deepEqual(getMixTracks([tracks[0]]), []);
  assert.deepEqual(getMixTracks([{ index: 1, name: "Full mix" }, { index: 2, name: "Game" }]), []);
  assert.deepEqual(getMixTracks(undefined), []);
});

test("keeps track 1 until a volume changes", () => {
  const mixTracks = getMixTracks(tracks);
  assert.equal(buildMix(mixTracks, {}), null);
  assert.equal(buildMix(mixTracks, { 2: { volume: 100, muted: false } }), null);
  assert.deepEqual(buildMix(mixTracks, { 3: { volume: 150, muted: true }, 4: { volume: 50 } }), [
    { index: 2, volume: 1 },
    { index: 3, volume: 0 },
    { index: 4, volume: 0.5 },
  ]);
});

test("copies track 1 when there's no mix", () => {
  assert.deepEqual(buildAudioOutputOptions(null), ["-map", "0:v:0", "-map", "0:a:0?", "-c", "copy"]);
  assert.deepEqual(buildAudioOutputOptions([{ index: 1, volume: 2 }]), ["-map", "0:v:0", "-map", "0:a:0?", "-c", "copy"]);
});

test("sums the separated tracks with their volumes", () => {
  const options = buildAudioOutputOptions([
    { index: 2, volume: 1.5 },
    { index: 3, volume: 0 },
    { index: 4, volume: 9 },
  ]);
  assert.equal(
    options[1],
    "[0:a:1]volume=1.5[a0];[0:a:2]volume=0[a1];[0:a:3]volume=2[a2];[a0][a1][a2]amix=inputs=3:normalize=0,alimiter=level=false:latency=true[mix]"
  );
  assert.deepEqual(options.slice(2), ["-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k"]);
});

test("takes the audio from another input when saving a screen file", () => {
  assert.deepEqual(buildAudioOutputOptions(null, 1), ["-map", "0:v:0", "-map", "1:a:0?", "-c", "copy"]);
  assert.ok(buildAudioOutputOptions([{ index: 2, volume: 0.5 }, { index: 3, volume: 1 }], 1)[1].startsWith("[1:a:1]volume=0.5[a0];[1:a:2]volume=1[a1];"));
});
