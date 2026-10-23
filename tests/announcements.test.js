import { test } from "node:test";
import assert from "node:assert/strict";
import { getNewAnnouncements, parseAnnouncements } from "../src/lib/announcements.js";

const announcements = `# Announcements

# v1.3.0 New Clipping Feature

ClipX now lets you save clips.
How to use:
1. Go to Settings
# not a version heading

# v1.2.6 Smaller Fix
Body
`;

test("splits announcements on version headings only", () => {
  assert.deepEqual(parseAnnouncements(announcements), [
    {
      version: "v1.3.0",
      title: "New Clipping Feature",
      content: "ClipX now lets you save clips.\nHow to use:\n1. Go to Settings\n# not a version heading",
    },
    { version: "v1.2.6", title: "Smaller Fix", content: "Body" },
  ]);
});

test("allows a version heading without a title", () => {
  assert.deepEqual(parseAnnouncements("# v1.3.0\nBody"), [{ version: "v1.3.0", title: "", content: "Body" }]);
});

test("shows announcements newer than the last seen version up to the current one", () => {
  const titles = (from, current) => getNewAnnouncements(announcements, from, current).map((item) => item.title);

  assert.deepEqual(titles("1.2.5", "1.3.0"), ["New Clipping Feature", "Smaller Fix"]);
  assert.deepEqual(titles("1.2.6", "1.3.0"), ["New Clipping Feature"]);
  assert.deepEqual(titles("1.2.5", "1.2.6"), ["Smaller Fix"]);
  assert.deepEqual(titles("1.3.0", "1.3.1"), []);
});

test("skips announcements whose version isn't valid", () => {
  const text = "# v1.3.0-beta.01 Typo\nBody\n\n# v1.3.0 Valid\nBody";
  assert.deepEqual(getNewAnnouncements(text, "1.2.5", "1.3.0").map((item) => item.title), ["Valid"]);
});

test("shows nothing without valid versions", () => {
  assert.deepEqual(getNewAnnouncements(announcements, null, "1.3.0"), []);
  assert.deepEqual(getNewAnnouncements(announcements, "junk", "1.3.0"), []);
});
