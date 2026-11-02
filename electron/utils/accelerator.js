export const VK_SHIFT = 0x10;
export const VK_CONTROL = 0x11;
export const VK_MENU = 0x12;
export const VK_LWIN = 0x5b;
export const VK_RWIN = 0x5c;

const NAMED_KEYS = {
  space: 0x20,
  tab: 0x09,
  insert: 0x2d,
  delete: 0x2e,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
};

function toVirtualKey(key) {
  const name = key.toLowerCase();
  if (/^[a-z]$/.test(name)) return name.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(name)) return name.charCodeAt(0);
  const functionKey = /^f([1-9]|1\d|2[0-4])$/.exec(name);
  if (functionKey) return 0x6f + Number(functionKey[1]);
  return NAMED_KEYS[name] ?? null;
}

export function parseAccelerator(accelerator) {
  const parts = String(accelerator || "").split("+").map((part) => part.trim()).filter(Boolean);
  const keyCode = parts.length ? toVirtualKey(parts[parts.length - 1]) : null;
  if (keyCode === null) {
    return null;
  }

  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  for (const modifier of modifiers) {
    if (!["ctrl", "control", "alt", "shift", "super", "meta", "cmdorctrl"].includes(modifier)) {
      return null;
    }
  }

  return {
    keyCode,
    ctrl: modifiers.has("ctrl") || modifiers.has("control") || modifiers.has("cmdorctrl"),
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
    super: modifiers.has("super") || modifiers.has("meta"),
  };
}

export function isHotkeyDown(hotkey, isKeyDown) {
  return isKeyDown(hotkey.keyCode)
    && isKeyDown(VK_CONTROL) === hotkey.ctrl
    && isKeyDown(VK_MENU) === hotkey.alt
    && isKeyDown(VK_SHIFT) === hotkey.shift
    && (isKeyDown(VK_LWIN) || isKeyDown(VK_RWIN)) === hotkey.super;
}
