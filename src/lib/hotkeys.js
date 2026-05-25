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

export function isTextEntryActive(event) {
  return Boolean(
    closestEditableElement(event?.target) ||
      closestEditableElement(document.activeElement)
  );
}
