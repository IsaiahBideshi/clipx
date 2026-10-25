import { test } from "node:test";
import assert from "node:assert/strict";
import { toAccelerator } from "../src/lib/hotkeys.js";

test("turns key presses into Electron accelerators", () => {
  assert.equal(toAccelerator({ code: "F8", altKey: true }), "Alt+F8");
  assert.equal(toAccelerator({ code: "KeyK", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+K");
  assert.equal(toAccelerator({ code: "Digit4", metaKey: true }), "Super+4");
  assert.equal(toAccelerator({ code: "F9" }), "F9");
});

test("rejects modifier-only presses and bare typing keys", () => {
  assert.equal(toAccelerator({ code: "AltLeft", altKey: true }), null);
  assert.equal(toAccelerator({ code: "KeyA" }), null);
  assert.equal(toAccelerator({ code: "KeyA", shiftKey: true }), null);
  assert.equal(toAccelerator(undefined), null);
});
