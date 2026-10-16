import { test } from "node:test";
import assert from "node:assert/strict";
import { getClipTagsError } from "../src/lib/clipsApi.js";

test("allows up to 20 tags", () => {
  assert.equal(getClipTagsError(Array(20).fill("tag")), null);
  assert.equal(getClipTagsError(Array(21).fill("tag")), "A clip can have at most 20 tags");
});

test("allows tags up to 50 characters after trimming", () => {
  assert.equal(getClipTagsError(["a".repeat(50)]), null);
  assert.equal(getClipTagsError([`  ${"a".repeat(50)}  `]), null);
  assert.equal(getClipTagsError(["a".repeat(51)]), "Tags must be 50 characters or fewer");
});

test("counts emoji as one character", () => {
  assert.equal(getClipTagsError(["😀".repeat(50)]), null);
});

test("ignores tags that are not strings", () => {
  assert.equal(getClipTagsError([null, 42]), null);
});
