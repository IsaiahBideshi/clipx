import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import "./updatemodal.css";

export default function UpdateModal() {
  const [updateState, setUpdateState] = useState(null);
  const [dismissedVersion, setDismissedVersion] = useState(null);
  const [userStartedUpdate, setUserStartedUpdate] = useState(false);

  useEffect(() => {
    if (!window.clipx?.onUpdateState) {
      return undefined;
    }

    let mounted = true;
    window.clipx.getUpdateState?.().then((state) => {
      if (mounted) {
        setUpdateState(state);
      }
    });

    const unsubscribe = window.clipx.onUpdateState((state) => {
      setUpdateState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const updateVersion = updateState?.update?.version;
  const isDismissed = updateVersion && dismissedVersion === updateVersion;
  const shouldShow = useMemo(() => {
    if (!updateState) {
      return false;
    }

    if (updateState.status === "available") {
      return !isDismissed;
    }

    if (updateState.status === "downloading") {
      return true;
    }

    if (updateState.status === "downloaded") {
      return !isDismissed;
    }

    return updateState.status === "error" && userStartedUpdate;
  }, [isDismissed, updateState, userStartedUpdate]);

  if (!shouldShow) {
    return null;
  }

  const currentVersion = updateState.currentVersion;
  const progress = Math.max(0, Math.min(100, updateState.progress || 0));

  async function startDownload() {
    setUserStartedUpdate(true);
    await window.clipx?.downloadUpdate?.();
  }

  function dismiss() {
    setDismissedVersion(updateVersion || "unknown");
    setUserStartedUpdate(false);
  }

  function installUpdate() {
    window.clipx?.installUpdate?.();
  }

  return (
    <div className="update-modal-backdrop" role="presentation">
      <section className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
        {updateState.status === "available" && (
          <>
            <h2 id="update-modal-title">Update available</h2>
            <p>
              ClipX {updateVersion} is available. You are currently running {currentVersion}.
            </p>
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={dismiss}>Not now</Button>
              <Button variant="contained" onClick={startDownload}>Update</Button>
            </div>
          </>
        )}

        {updateState.status === "downloading" && (
          <>
            <h2 id="update-modal-title">Downloading update</h2>
            <p>ClipX {updateVersion || "update"} is downloading.</p>
            <LinearProgress variant="determinate" value={progress} />
            <span className="update-progress-label">{progress}%</span>
          </>
        )}

        {updateState.status === "downloaded" && (
          <>
            <h2 id="update-modal-title">Ready to install</h2>
            <p>Restart ClipX to finish installing version {updateVersion}.</p>
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={dismiss}>Later</Button>
              <Button variant="contained" onClick={installUpdate}>Restart</Button>
            </div>
          </>
        )}

        {updateState.status === "error" && (
          <>
            <h2 id="update-modal-title">Update failed</h2>
            <p>{updateState.message || "ClipX could not complete the update."}</p>
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={dismiss}>Close</Button>
              <Button variant="contained" onClick={startDownload}>Retry</Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
