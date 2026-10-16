import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { isSkippableMediaDirectory, isSupportedVideoFile } from "../electron/utils/videoFiles.js";

test("recognizes video files by extension, ignoring case", () => {
  assert.equal(isSupportedVideoFile(path.join("Clips", "match.mp4")), true);
  assert.equal(isSupportedVideoFile(path.join("Clips", "match.MKV")), true);
  assert.equal(isSupportedVideoFile(path.join("Clips", "match.mp4.part")), false);
  assert.equal(isSupportedVideoFile(path.join("Clips", "thumb.jpg")), false);
});

test("handles missing paths", () => {
  assert.equal(isSupportedVideoFile(undefined), false);
  assert.equal(isSkippableMediaDirectory(null), false);
});

test("skips thumbnail folders, ignoring case", () => {
  assert.equal(isSkippableMediaDirectory(path.join("Clips", "Thumbs")), true);
  assert.equal(isSkippableMediaDirectory(path.join("Clips", "Saved Clips Thumbs")), true);
  assert.equal(isSkippableMediaDirectory(path.join("Clips", "Saved Clips")), false);
});
