import { useEffect, useState } from "react";

import { describeRecorders } from "../../electron/utils/recordingPlan.js";

export function getClippingStatusLabel(state) {
  switch (state?.status) {
    case "installing":
      return state.progress >= 100 ? "Installing OBS..." : `Downloading OBS... ${state.progress || 0}%`;
    case "starting":
      return "Starting OBS...";
    case "ready":
      return state.recordings?.length > 1 ? `Recording · ${describeRecorders(state.recordings)}` : "Recording";
    case "error":
      return state.message || "Clipping failed to start.";
    default:
      return "Off";
  }
}

export function useClippingState() {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (typeof window.clipx?.onClippingState !== "function") {
      return undefined;
    }

    let mounted = true;
    window.clipx.getClippingState()
      .then((initialState) => {
        if (mounted) {
          setState(initialState);
        }
      })
      .catch((err) => console.error("Failed to load clipping state:", err));
    const unsubscribe = window.clipx.onClippingState(setState);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}
