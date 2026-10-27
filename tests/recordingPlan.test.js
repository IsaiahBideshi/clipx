import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampClipSeconds,
  describeRecorders,
  getRecordingOptions,
  estimateLoad,
  findMonitorItem,
  numberScreens,
  pickFollowScreen,
  planAudioTracks,
  planRecorders,
  toAudioTrackMap,
  toOutputSize,
} from "../electron/utils/recordingPlan.js";

const screens = numberScreens([
  { id: 20, x: 2560, y: 180, width: 1920, height: 1080, primary: false },
  { id: 10, x: 0, y: 0, width: 2560, height: 1440, primary: true },
  { id: 30, x: -1080, y: -240, width: 1080, height: 1920, primary: false },
]);

test("numbers screens left to right", () => {
  assert.deepEqual(screens.map((screen) => [screen.id, screen.number]), [[30, 1], [10, 2], [20, 3]]);
});

test("scales output to the chosen height without upscaling or going past 4096 wide", () => {
  assert.deepEqual(toOutputSize(2560, 1440, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(toOutputSize(1920, 1080, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(toOutputSize(5120, 1440, 1440), { width: 4096, height: 1152 });
  assert.deepEqual(toOutputSize(1281, 721, 1080), { width: 1280, height: 720 });
});

test("records only the main screen when one screen is enabled", () => {
  const recorders = planRecorders(screens, { clipDisabledScreens: [20, 30] });
  assert.equal(recorders.length, 1);
  assert.equal(recorders[0].screenId, 10);
});

test("follows the active screen and records every enabled screen when auto switch is on", () => {
  const recorders = planRecorders(screens, { clipAutoSwitch: true, clipDisabledScreens: [30], clipPrimaryHeight: 1440 });
  assert.deepEqual(recorders.map((recorder) => recorder.key), ["main", "screen-10", "screen-20"]);
  assert.equal(recorders[0].screenId, null);
  assert.deepEqual(recorders[0].canvas, { width: 2560, height: 1440 });
  assert.equal(recorders[1].fps, 30);
});

test("skips the fixed primary screen's secondary recording when auto switch is off", () => {
  const recorders = planRecorders(screens, { clipAutoSwitch: false, clipPrimaryScreen: 20 });
  assert.equal(recorders[0].screenId, 20);
  assert.deepEqual(recorders.slice(1).map((recorder) => recorder.screenId), [30, 10]);
});

test("falls back to the Windows primary screen when the chosen one is off", () => {
  const recorders = planRecorders(screens, { clipAutoSwitch: false, clipPrimaryScreen: 30, clipDisabledScreens: [30] });
  assert.equal(recorders[0].screenId, 10);
});

test("records nothing when every screen is off", () => {
  assert.deepEqual(planRecorders(screens, { clipDisabledScreens: [10, 20, 30] }), []);
});

test("keeps the primary on the last enabled screen when the mouse is on a disabled one", () => {
  const enabled = screens.filter((screen) => screen.id !== 30);
  assert.equal(pickFollowScreen(enabled, 20, 10), 20);
  assert.equal(pickFollowScreen(enabled, 30, 10), 10);
  assert.equal(pickFollowScreen(enabled, 30, 99), enabled[0].id);
});

test("keeps the clip length in range", () => {
  assert.equal(clampClipSeconds(45), 45);
  assert.equal(clampClipSeconds("90"), 90);
  assert.equal(clampClipSeconds(12.6), 13);
  assert.equal(clampClipSeconds(1), 5);
  assert.equal(clampClipSeconds(600), 600);
  assert.equal(clampClipSeconds(999), 600);
  assert.equal(clampClipSeconds("abc"), 30);
  assert.equal(getRecordingOptions({ clipSeconds: 900 }).clipSeconds, 600);
  assert.equal(getRecordingOptions({}).clipSeconds, 30);
});

test("describes what each recording is", () => {
  assert.equal(describeRecorders(planRecorders(screens, { clipAutoSwitch: true, clipDisabledScreens: [30] })), "1 following you + 2 screens");
  assert.equal(describeRecorders(planRecorders(screens, { clipAutoSwitch: false })), "3 screens");
  assert.equal(describeRecorders(planRecorders(screens, { clipDisabledScreens: [20, 30] })), "1 screen");
});

test("estimates load from resolution and fps", () => {
  assert.equal(estimateLoad(planRecorders(screens, { clipDisabledScreens: [20, 30] })), "Light");
  assert.equal(estimateLoad(planRecorders(screens, { clipPrimaryHeight: 2160, clipSecondaryHeight: 1440, clipSecondaryFps: 60 })), "Heavy");
});

test("lays out audio tracks after the full mix", () => {
  const plan = planAudioTracks([{ kind: "game" }, { kind: "mic" }, { kind: "app", exe: "Discord.exe" }]);
  assert.deepEqual(plan.tracks.map((track) => track.index), [2, 3, 4]);
  assert.equal(plan.recTracks, 0b1111);
  assert.equal(plan.micTrack, 3);
  assert.equal(planAudioTracks([]).recTracks, 1);
  assert.equal(planAudioTracks(Array.from({ length: 8 }, () => ({ kind: "app" }))).tracks.length, 5);
  assert.deepEqual(toAudioTrackMap(1, 3), { 1: true, 2: false, 3: true, 4: false, 5: false, 6: false });
});

test("matches an OBS monitor by its desktop position", () => {
  const items = [
    { itemName: "DELL: 1920x1080 @ 2560,180", itemValue: "b" },
    { itemName: "LG: 2560x1440 @ 0,0 (Primary Monitor)", itemValue: "a" },
    { itemName: "BenQ: 1080x1920 @ -1080,-240", itemValue: "c" },
  ];
  assert.equal(findMonitorItem(items, screens[1]).itemValue, "a");
  assert.equal(findMonitorItem(items, screens[0]).itemValue, "c");
  assert.equal(findMonitorItem(items, { x: 0, y: 1 }), null);
});
