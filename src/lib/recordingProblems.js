import { useEffect, useRef } from "react";
import { useClippingState } from "./clippingState.js";
import { addRecordingProblem, applyClippingState } from "./notificationItems.js";

export function useRecordingProblems(setLocalNotifications) {
  const state = useClippingState();
  const previousStatus = useRef(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    const previous = previousStatus.current;
    const now = new Date().toISOString();
    previousStatus.current = state.status;
    setLocalNotifications((items) => applyClippingState(items, previous, state, now));
  }, [state?.status, state?.message]);

  useEffect(() => window.clipx?.onClippingProblem?.((problem) => {
    const now = new Date().toISOString();
    setLocalNotifications((items) => addRecordingProblem(items, problem, now));
  }), [setLocalNotifications]);
}
