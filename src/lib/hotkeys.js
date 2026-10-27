const TEXT_ENTRY_SELECTOR = [
  'input:not([type="range"])',
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  '[role="combobox"]',
  "[data-disable-global-hotkeys]",
].join(", ");

function closestEditableElement(target) {
  if (!(target instanceof Element)) return null;
  return target.closest(TEXT_ENTRY_SELECTOR);
}

const ACCELERATOR_KEYS = {
  Space: "Space",
  Tab: "Tab",
  Insert: "Insert",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

function toAcceleratorKey(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return ACCELERATOR_KEYS[code] || null;
}

export function toAccelerator(event) {
  const key = toAcceleratorKey(event?.code || "");
  const hasModifier = Boolean(event?.ctrlKey || event?.altKey || event?.metaKey);
  if (!key || (!hasModifier && !/^F\d/.test(key))) return null;

  return [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
    key,
  ].filter(Boolean).join("+");
}

export function isTextEntryActive(event) {
  return Boolean(
    closestEditableElement(event?.target) ||
      closestEditableElement(document.activeElement)
  );
}
