import { useEffect, useRef } from "react";
import { isTextEntryActive } from "./hotkeys.js";

export function useEscapeKey(onEscape, enabled) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e) {
      if (!isTextEntryActive(e) && e.code === "Escape") {
        onEscape();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape, enabled]);
}

export function useBackdropClose(onClose, enabled) {
  const pressedBackdropRef = useRef(false);

  return {
    onMouseDown: (e) => {
      pressedBackdropRef.current = e.target === e.currentTarget;
    },
    onClick: (e) => {
      if (enabled && pressedBackdropRef.current && e.target === e.currentTarget) {
        onClose();
      }
    },
  };
}
