import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClipManifest, describeClip, getAudioTrackNames, getClipName, getManifestFile, getScreenCount, keepManifestFile, removeManifestFile, renameManifestFile } from "../electron/utils/clipManifest.js";

test("describes a saved clip for its notification", () => {
  const files = (follows, secondaries) => [
    { role: "primary", follows },
    ...Array.from({ length: secondaries }, () => ({ role: "secondary" })),
  ];
  assert.equal(describeClip({ seconds: 30, game: { name: "VALORANT" }, files: files(true, 2) }), "VALORANT · last 30 s · 2 screens");
  assert.equal(describeClip({ seconds: 30, game: null, files: files(false, 1) }), "last 30 s · 2 screens");
  assert.equal(describeClip({ seconds: 15, game: null, files: files(false, 0) }), "last 15 s");
});

test("names clips by date, game and 12-hour time", () => {
  assert.equal(getClipName(new Date(2026, 9, 25, 15, 52, 30), "VALORANT"), "Clip 2026-Oct-25 [VALORANT] 03꞉52꞉30PM");
  assert.equal(getClipName(new Date(2026, 0, 5, 9, 3, 7)), "Clip 2026-Jan-05 09꞉03꞉07AM");
  assert.equal(getClipName(new Date(2026, 0, 5, 0, 0, 0)), "Clip 2026-Jan-05 12꞉00꞉00AM");
  assert.equal(getClipName(new Date(2026, 0, 5, 12, 0, 0)), "Clip 2026-Jan-05 12꞉00꞉00PM");
});

test("strips characters Windows doesn't allow from the game name", () => {
  assert.equal(getClipName(new Date(2026, 0, 5, 9, 3, 7), "Call of Duty: Black Ops II"), "Clip 2026-Jan-05 [Call of Duty Black Ops II] 09꞉03꞉07AM");
  assert.equal(getClipName(new Date(2026, 0, 5, 9, 3, 7), 'What? <"/\\|*>.'), "Clip 2026-Jan-05 [What] 09꞉03꞉07AM");
  assert.equal(getClipName(new Date(2026, 0, 5, 9, 3, 7), ":::"), "Clip 2026-Jan-05 09꞉03꞉07AM");
});

test("describes the primary and secondary files of a clip", () => {
  const manifest = buildClipManifest({
    folderName: "Clip 2026-10-05 09-03-07",
    createdAt: "2026-10-05T13:03:07.000Z",
    seconds: 30,
    game: { id: 242408, name: "Counter-Strike 2" },
    primary: { follows: true, audioTracks: getAudioTrackNames({ tracks: [{ kind: "mic", index: 2 }, { kind: "app", exe: "Discord.exe", index: 3 }], otherAppsTrack: 4 }) },
    secondaries: [{ screen: { number: 2, label: "DELL", width: 1920, height: 1080 } }],
  });

  assert.equal(manifest.files[0].file, "Clip 2026-10-05 09-03-07.mp4");
  assert.deepEqual(manifest.files[0].audioTracks.map((track) => track.name), ["Full mix", "Microphone", "Discord.exe", "Other apps"]);
  assert.deepEqual(manifest.files[0].audioTracks.map((track) => track.kind), ["mix", "mic", "app", "other"]);
  assert.deepEqual(getAudioTrackNames({ tracks: [{ kind: "mic", index: 2 }], desktopTrack: 3 }).map((track) => track.kind), ["mix", "mic", "desktop"]);
  assert.equal(getManifestFile(manifest, "screen 2.MP4").role, "secondary");
  assert.equal(getManifestFile(manifest, "other.mp4"), null);
  assert.equal(manifest.game.id, 242408);
});

test("renames a file in the manifest and leaves the rest alone", () => {
  const manifest = {
    version: 1,
    seconds: 30,
    files: [
      { file: "Clip 2026-Oct-25 03꞉52꞉30PM.mp4", role: "primary" },
      { file: "Screen 2.mp4", role: "secondary" },
    ],
  };

  const renamed = renameManifestFile(manifest, "clip 2026-oct-25 03꞉52꞉30pm.MP4", "[ORIGINAL] Ace.mp4");
  assert.deepEqual(renamed.files.map((entry) => entry.file), ["[ORIGINAL] Ace.mp4", "Screen 2.mp4"]);
  assert.equal(renamed.files[0].role, "primary");
  assert.equal(renamed.seconds, 30);
  assert.equal(manifest.files[0].file, "Clip 2026-Oct-25 03꞉52꞉30PM.mp4");
  assert.equal(renameManifestFile(manifest, "Other.mp4", "New.mp4"), null);
  assert.equal(renameManifestFile(null, "Screen 2.mp4", "New.mp4"), null);
});

test("removes a file from the manifest and counts screens", () => {
  const manifest = {
    files: [
      { file: "Clip.mp4", role: "primary", follows: true },
      { file: "Screen 1.mp4", role: "secondary" },
      { file: "Screen 2.mp4", role: "secondary" },
    ],
  };

  assert.equal(getScreenCount(manifest.files), 2);
  const removed = removeManifestFile(manifest, "screen 2.mp4");
  assert.deepEqual(removed.files.map((entry) => entry.file), ["Clip.mp4", "Screen 1.mp4"]);
  assert.equal(getScreenCount(removed.files), 1);
  assert.equal(getScreenCount([{ role: "primary", follows: false }, { role: "secondary" }]), 2);
  assert.equal(removeManifestFile(manifest, "Screen 3.mp4"), null);
});

test("keeps one file of a clip as its primary", () => {
  const tracks = [{ index: 1, name: "Full mix", kind: "mix" }];
  const manifest = {
    seconds: 30,
    files: [
      { file: "Clip.mp4", role: "primary", follows: true, screen: null, audioTracks: tracks },
      { file: "Screen 1.mp4", role: "secondary", follows: false, screen: { number: 1 }, audioTracks: [] },
      { file: "Screen 2.mp4", role: "secondary", follows: false, screen: { number: 2 }, audioTracks: [] },
    ],
  };

  assert.deepEqual(keepManifestFile(manifest, "Clip.mp4").files, [manifest.files[0]]);
  const kept = keepManifestFile(manifest, "screen 2.mp4", "Clip (Screen 2).mp4");
  assert.equal(kept.seconds, 30);
  assert.deepEqual(kept.files, [
    { file: "Clip (Screen 2).mp4", role: "primary", follows: false, screen: { number: 2 }, audioTracks: tracks },
  ]);
  assert.equal(getScreenCount(kept.files), 1);
  assert.equal(keepManifestFile(manifest, "Screen 3.mp4"), null);
  assert.equal(keepManifestFile(null, "Clip.mp4"), null);
});
