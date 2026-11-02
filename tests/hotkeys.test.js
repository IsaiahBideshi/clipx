import { test } from "node:test";
import assert from "node:assert/strict";
import { toAccelerator } from "../src/lib/hotkeys.js";

test("turns key presses into Electron accelerators", () => {
  assert.equal(toAccelerator({ code: "F8", keyCode: 119, altKey: true }), "Alt+F8");
  assert.equal(toAccelerator({ code: "KeyK", keyCode: 75, ctrlKey: true, shiftKey: true }), "Ctrl+Shift+K");
  assert.equal(toAccelerator({ code: "Digit4", keyCode: 52, metaKey: true }), "Super+4");
  assert.equal(toAccelerator({ code: "F9", keyCode: 120 }), "F9");
});

test("saves letters by the key Windows reports, not the key's position", () => {
  assert.equal(toAccelerator({ code: "KeyW", keyCode: 90, altKey: true }), "Alt+Z");
  assert.equal(toAccelerator({ code: "KeyM", keyCode: 188, altKey: true }), null);
});

test("rejects modifier-only presses and bare typing keys", () => {
  assert.equal(toAccelerator({ code: "AltLeft", keyCode: 18, altKey: true }), null);
  assert.equal(toAccelerator({ code: "KeyA", keyCode: 65 }), null);
  assert.equal(toAccelerator({ code: "KeyA", keyCode: 65, shiftKey: true }), null);
  assert.equal(toAccelerator(undefined), null);
});
