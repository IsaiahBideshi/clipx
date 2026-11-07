import { test } from "node:test";
import assert from "node:assert/strict";
import { groupClipSessions } from "../src/lib/clipSessions.js";

test("groups back-to-back clips from the same game session", () => {
  const clip = (name, sessionId, gameName = null) => ({ name, sessionId, gameName });
  const sessions = groupClipSessions([
    clip("a", null),
    clip("b", "rl", "Rocket League"),
    clip("c", "rl", "Rocket League"),
    clip("d", "gta-2", "GTA V"),
    clip("e", "gta-1", "GTA V"),
    clip("f", "gta-1", "GTA V"),
    clip("g", undefined),
    clip("h", null),
  ]);

  assert.deepEqual(
    sessions.map((session) => [session.id, session.gameName, session.clips.map((item) => item.name)]),
    [
      [null, null, ["a"]],
      ["rl", "Rocket League", ["b", "c"]],
      ["gta-2", "GTA V", ["d"]],
      ["gta-1", "GTA V", ["e", "f"]],
      [null, null, ["g", "h"]],
    ],
  );
  assert.deepEqual(groupClipSessions([]), []);
});

test("names a session after its newest clip with a game", () => {
  const [session] = groupClipSessions([
    { name: "after close", sessionId: "gta", gameName: null },
    { name: "newest in game", sessionId: "gta", gameName: "GTA V" },
    { name: "oldest", sessionId: "gta", gameName: "GTA V (old name)" },
  ]);

  assert.equal(session.gameName, "GTA V");
  assert.equal(session.clips.length, 3);
});
