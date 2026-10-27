import { test } from "node:test";
import assert from "node:assert/strict";
import { VK_CONTROL, VK_MENU, VK_SHIFT, isHotkeyDown, parseAccelerator } from "../electron/utils/accelerator.js";

test("parses the accelerators the hotkey picker produces", () => {
  assert.deepEqual(parseAccelerator("F7"), { keyCode: 0x76, ctrl: false, alt: false, shift: false, super: false });
  assert.deepEqual(parseAccelerator("Alt+F8"), { keyCode: 0x77, ctrl: false, alt: true, shift: false, super: false });
  assert.deepEqual(parseAccelerator("Ctrl+Shift+K"), { keyCode: 0x4b, ctrl: true, alt: false, shift: true, super: false });
  assert.equal(parseAccelerator("Super+4").keyCode, 0x34);
  assert.equal(parseAccelerator("Alt+PageDown").keyCode, 0x22);
  assert.equal(parseAccelerator("F24").keyCode, 0x87);
});

test("rejects accelerators it can't watch", () => {
  assert.equal(parseAccelerator("Nope+Bad"), null);
  assert.equal(parseAccelerator("Alt+"), null);
  assert.equal(parseAccelerator(""), null);
  assert.equal(parseAccelerator("Hyper+F8"), null);
});

test("matches only the exact combo", () => {
  const altF8 = parseAccelerator("Alt+F8");
  const pressed = (...keys) => (key) => keys.includes(key);
  assert.equal(isHotkeyDown(altF8, pressed(VK_MENU, 0x77)), true);
  assert.equal(isHotkeyDown(altF8, pressed(0x77)), false);
  assert.equal(isHotkeyDown(altF8, pressed(VK_MENU, VK_CONTROL, 0x77)), false);
  assert.equal(isHotkeyDown(parseAccelerator("F7"), pressed(VK_SHIFT, 0x76)), false);
});
