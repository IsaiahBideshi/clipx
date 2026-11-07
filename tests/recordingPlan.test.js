import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampBitrate,
  clampClipSeconds,
  describeRecorders,
  getRecordingOptions,
  estimateLoad,
  findMonitorItem,
  getDuplicateScreen,
  getFollowScreens,
  numberScreens,
  pickFollowScreen,
  pickOtherAudioApps,
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
  const recorders = planRecorders(screens, { clipAutoSwitch: false, clipDisabledScreens: [20, 30] });
  assert.equal(recorders.length, 1);
  assert.equal(recorders[0].screenId, 10);
});

test("follows across every screen with one recording when auto switch is on and one screen is enabled", () => {
  const recorders = planRecorders(screens, { clipAutoSwitch: true, clipDisabledScreens: [20, 30] });
  assert.deepEqual(recorders.map((recorder) => recorder.key), ["main"]);
  assert.equal(recorders[0].screenId, null);
  assert.deepEqual(recorders[0].canvas, { width: 2560, height: 1920 });
  assert.deepEqual(getFollowScreens(screens, { clipAutoSwitch: true, clipDisabledScreens: [20, 30] }), screens);
  assert.deepEqual(getFollowScreens(screens, { clipAutoSwitch: true, clipDisabledScreens: [30] }).map((screen) => screen.id), [10, 20]);
});

test("follows the active screen and records every enabled screen when auto switch is on", () => {
  const recorders = planRecorders(screens, { clipAutoSwitch: true, clipDisabledScreens: [30], clipPrimaryHeight: 1440 });
  assert.deepEqual(recorders.map((recorder) => recorder.key), ["main", "screen-10", "screen-20"]);
  assert.equal(recorders[0].screenId, null);
  assert.deepEqual(recorders[0].canvas, { width: 2560, height: 1440 });
  assert.equal(recorders[1].fps, 60);
  assert.deepEqual(recorders[1].output, { width: 2560, height: 1440 });
  assert.equal(recorders[2].fps, 30);
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

test("keeps the bitrate in range and gives each recorder its screen's bitrate", () => {
  assert.equal(clampBitrate(45.4, 20), 45);
  assert.equal(clampBitrate(0, 20), 1);
  assert.equal(clampBitrate(500, 20), 100);
  assert.equal(clampBitrate("abc", 20), 20);
  assert.equal(getRecordingOptions({ clipPrimaryBitrate: 999 }).clipPrimaryBitrate, 100);
  assert.equal(getRecordingOptions({}).clipSecondaryBitrate, 6);

  const recorders = planRecorders(screens, { clipPrimaryBitrate: 40, clipSecondaryBitrate: 10 });
  assert.deepEqual(recorders.map((recorder) => [recorder.key, recorder.bitrate]), [["main", 40], ["screen-30", 10], ["screen-10", 40], ["screen-20", 10]]);
});

test("describes what each recording is", () => {
  assert.equal(describeRecorders(planRecorders(screens, { clipAutoSwitch: true, clipDisabledScreens: [30] })), "1 following you + 2 screens");
  assert.equal(describeRecorders(planRecorders(screens, { clipAutoSwitch: false })), "3 screens");
  assert.equal(describeRecorders(planRecorders(screens, { clipAutoSwitch: false, clipDisabledScreens: [20, 30] })), "1 screen");
  assert.equal(describeRecorders(planRecorders(screens, { clipAutoSwitch: true, clipDisabledScreens: [20, 30] })), "1 following you");
});

test("estimates load from resolution and fps", () => {
  assert.equal(estimateLoad(planRecorders(screens, { clipDisabledScreens: [20, 30] })), "Light");
  assert.equal(estimateLoad(planRecorders(screens, { clipPrimaryHeight: 2160, clipSecondaryHeight: 1440, clipSecondaryFps: 60 })), "Heavy");
});

test("lays out audio tracks after the full mix", () => {
  const plan = planAudioTracks([{ kind: "game" }, { kind: "mic" }, { kind: "app", exe: "Discord.exe" }]);
  assert.deepEqual(plan.tracks.map((track) => track.index), [2, 3, 4]);
  assert.equal(plan.recTracks, 0b11111);
  assert.equal(plan.micTrack, 3);
  assert.equal(plan.otherAppsTrack, 5);
  assert.equal(plan.desktopTrack, null);
  assert.equal(planAudioTracks(Array.from({ length: 8 }, () => ({ kind: "app" }))).tracks.length, 4);
  assert.equal(planAudioTracks(Array.from({ length: 8 }, () => ({ kind: "app" }))).otherAppsTrack, 6);
  assert.deepEqual(toAudioTrackMap(1, 3), { 1: true, 2: false, 3: true, 4: false, 5: false, 6: false });
});

test("records only the full mix when no tracks are added", () => {
  const plan = planAudioTracks([]);
  assert.equal(plan.recTracks, 1);
  assert.equal(plan.desktopTrack, null);
  assert.equal(plan.otherAppsTrack, null);
});

test("gives desktop audio its own track when only the mic is separated", () => {
  const plan = planAudioTracks([{ kind: "mic" }]);
  assert.equal(plan.recTracks, 0b111);
  assert.equal(plan.desktopTrack, 3);
  assert.equal(plan.otherAppsTrack, null);
});

test("picks other apps whose audio no other track already captures", () => {
  const processes = [
    { pid: 1, parentPid: 0, exeName: "explorer.exe" },
    { pid: 2, parentPid: 1, exeName: "Discord.exe" },
    { pid: 3, parentPid: 2, exeName: "Discord.exe" },
    { pid: 4, parentPid: 1, exeName: "chrome.exe" },
    { pid: 5, parentPid: 1, exeName: "steam.exe" },
    { pid: 6, parentPid: 5, exeName: "game.exe" },
    { pid: 7, parentPid: 2, exeName: "opened-from-discord.exe" },
  ];

  assert.deepEqual(
    pickOtherAudioApps(["explorer.exe", "Discord.exe", "chrome.exe", "CHROME.exe", "steam.exe", "game.exe", "opened-from-discord.exe"], ["discord.exe"], processes),
    ["CHROME.exe", "game.exe"],
  );
  assert.deepEqual(pickOtherAudioApps(["steam.exe"], ["game.exe"], processes), []);
  assert.deepEqual(pickOtherAudioApps(["chrome.exe"], [""], processes), ["chrome.exe"]);
});

test("survives a loop in the process parents", () => {
  const processes = [
    { pid: 1, parentPid: 2, exeName: "a.exe" },
    { pid: 2, parentPid: 1, exeName: "b.exe" },
  ];
  assert.deepEqual(pickOtherAudioApps(["c.exe"], [], processes), ["c.exe"]);
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

test("finds the screen file that copies an auto switch recording that never switched", () => {
  const plans = planRecorders(screens.filter((screen) => screen.id !== 30), {});
  const copies = plans.slice(1).map((plan) => ({ plan, screenId: plan.screenId }));
  const main = (screenId, screenSince) => ({ plan: plans[0], screenId, screenSince });

  assert.deepEqual(getDuplicateScreen(main(20, 1000), copies, screens, 1000), { screenId: 20, keep: "main" });
  assert.deepEqual(getDuplicateScreen(main(10, 0), copies, screens, 1000), { screenId: 10, keep: "main" });
  assert.equal(getDuplicateScreen(main(20, 1001), copies, screens, 1000), null);
  assert.equal(getDuplicateScreen(main(20, 0), [], screens, 1000), null);
  assert.equal(getDuplicateScreen({ plan: { ...plans[0], screenId: 10 }, screenId: 10, screenSince: 0 }, copies, screens, 1000), null);
  assert.equal(getDuplicateScreen(undefined, copies, screens, 1000), null);
});

test("keeps the screen file when the auto switch recording letterboxes a primary quality screen", () => {
  const mixed = numberScreens([
    { id: 1, x: 0, y: 0, width: 2304, height: 1440, primary: false },
    { id: 2, x: 2304, y: 0, width: 1920, height: 1080, primary: true },
  ]);
  const plans = planRecorders(mixed, {});
  const copies = plans.slice(1).map((plan) => ({ plan, screenId: plan.screenId }));
  const main = (screenId) => ({ plan: plans[0], screenId, screenSince: 0 });

  assert.deepEqual(getDuplicateScreen(main(2), copies, mixed, 1000), { screenId: 2, keep: "screen" });
  assert.deepEqual(getDuplicateScreen(main(1), copies, mixed, 1000), { screenId: 1, keep: "main" });
  const secondaryOnly = numberScreens([{ ...mixed[0], primary: true }, { ...mixed[1], primary: false }]);
  const secondaryPlans = planRecorders(secondaryOnly, {});
  const secondaryCopies = secondaryPlans.slice(1).map((plan) => ({ plan, screenId: plan.screenId }));
  assert.equal(getDuplicateScreen({ plan: secondaryPlans[0], screenId: 2, screenSince: 0 }, secondaryCopies, secondaryOnly, 1000), null);
});

test("keeps whichever copy of the screen is recorded at better quality", () => {
  const twin = numberScreens([
    { id: 1, x: 0, y: 0, width: 1920, height: 1080, primary: true },
    { id: 2, x: 1920, y: 0, width: 1920, height: 1080, primary: false },
  ]);
  const check = (options) => {
    const plans = planRecorders(twin, options);
    const copies = plans.slice(1).map((plan) => ({ plan, screenId: plan.screenId }));
    return getDuplicateScreen({ plan: plans[0], screenId: 2, screenSince: 0 }, copies, twin, 1000);
  };

  assert.deepEqual(check({}), { screenId: 2, keep: "main" });
  assert.equal(check({ clipPrimaryHeight: 720, clipPrimaryFps: 30, clipSecondaryHeight: 1080, clipSecondaryFps: 60 }), null);
  assert.deepEqual(
    check({ clipPrimaryHeight: 720, clipPrimaryFps: 30, clipPrimaryBitrate: 6, clipSecondaryHeight: 1080, clipSecondaryFps: 60, clipSecondaryBitrate: 20 }),
    { screenId: 2, keep: "screen" },
  );
});
