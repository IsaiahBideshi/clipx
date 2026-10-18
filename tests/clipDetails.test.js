import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClipDetails } from "../api-handlers/clips/clipDetails.js";

const valid = { title: "  Ace  ", visibility: "friends", gameId: 1020, userIds: [], labels: [] };

test("trims the title and maps gameId to game_id", () => {
  const { details, error } = parseClipDetails(valid);
  assert.equal(error, null);
  assert.deepEqual(details, { title: "Ace", visibility: "friends", game_id: 1020 });
});

test("rejects a blank title, unknown visibility and bad game ids", () => {
  assert.equal(parseClipDetails({ ...valid, title: "   " }).error, 'Missing "title"');
  assert.equal(parseClipDetails({ ...valid, visibility: "everyone" }).error, 'Invalid "visibility"');
  assert.equal(parseClipDetails({ ...valid, gameId: "1020" }).error, 'Invalid "gameId"');
  assert.equal(parseClipDetails({ ...valid, gameId: null }).details.game_id, null);
});

test("dedupes tags and drops blank labels", () => {
  const { userIds, labels } = parseClipDetails({ ...valid, userIds: ["a", "a"], labels: ["Bob", " bob ", "  "] });
  assert.deepEqual(userIds, ["a"]);
  assert.deepEqual(labels, ["bob"]);
});

test("enforces the tag limits", () => {
  assert.equal(parseClipDetails({ ...valid, labels: ["a".repeat(51)] }).error, "Tags must be 50 characters or fewer");
  assert.equal(parseClipDetails({ ...valid, labels: ["😀".repeat(50)] }).error, null);
  const labels = Array.from({ length: 21 }, (_, i) => `tag${i}`);
  assert.equal(parseClipDetails({ ...valid, labels }).error, "A clip can have at most 20 tags");
  assert.equal(parseClipDetails({ ...valid, labels: [42] }).error, "Invalid tags");
});
