import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import "./updatemodal.css";

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "").toLowerCase();
}

function parseChangelogSections(changelog, updateVersion) {
  const text = String(changelog || "").trim();
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const sections = [];
  let activeSection = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (activeSection) {
        sections.push(activeSection);
      }
      activeSection = {
        version: headingMatch[1].trim(),
        contentLines: [],
      };
      continue;
    }

    if (activeSection) {
      activeSection.contentLines.push(line);
    }
  }

  if (activeSection) {
    sections.push(activeSection);
  }

  if (!sections.length) {
    const version = updateVersion ? `v${normalizeVersion(updateVersion)}` : "Latest update";
    return [{
      version,
      content: text,
      isTarget: true,
    }];
  }

  const targetVersion = normalizeVersion(updateVersion);
  return sections.map((section) => ({
    version: section.version,
    content: section.contentLines.join("\n").trim(),
    isTarget: targetVersion && normalizeVersion(section.version) === targetVersion,
  }));
}

export default function UpdateModal() {
  const [updateState, setUpdateState] = useState(null);
  const [dismissedVersion, setDismissedVersion] = useState(null);
  const [userStartedUpdate, setUserStartedUpdate] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    if (!window.clipx?.onUpdateState) {
      return undefined;
    }

    let mounted = true;
    window.clipx.getUpdateState?.().then((state) => {
      if (mounted) {
        setUpdateState(state);
      }
    }).catch((err) => {
      console.error("Failed to load update state:", err);
    });

    const unsubscribe = window.clipx.onUpdateState((state) => {
      setUpdateState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    setPendingAction(null);
  }, [updateState?.status]);

  const updateVersion = updateState?.update?.version;
  const isDismissed = updateVersion && dismissedVersion === updateVersion;
  const shouldShow = useMemo(() => {
    if (!updateState) {
      return false;
    }

    if (updateState.status === "available") {
      return !isDismissed;
    }

    if (updateState.status === "downloading" || updateState.status === "cancelling" || updateState.status === "installing") {
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
  const releaseNotes = typeof updateState.update?.releaseNotes === "string"
    ? updateState.update.releaseNotes.trim()
    : "";
  const changelogSections = parseChangelogSections(releaseNotes, updateVersion);
  const releaseNotesSection = releaseNotes ? (
    <div className="update-changelog">
      <h3>Changelog</h3>
      <div className="update-changelog-list" aria-label="Release changelog">
        {changelogSections.map((section) => (
          <article
            className={`update-changelog-entry${section.isTarget ? " is-target" : ""}`}
            key={section.version}
          >
            <div className="update-changelog-entry-header">
              <span>{section.version}</span>
              {section.isTarget && <strong>Updating to this version</strong>}
            </div>
            {section.content && <div className="update-changelog-entry-body">{section.content}</div>}
          </article>
        ))}
      </div>
    </div>
  ) : null;

  async function startDownload() {
    setUserStartedUpdate(true);
    setPendingAction("download");
    try {
      await window.clipx?.downloadUpdate?.();
    } catch (err) {
      console.error("Failed to start update download:", err);
    } finally {
      setPendingAction(null);
    }
  }

  function dismiss() {
    setDismissedVersion(updateVersion || "unknown");
    setUserStartedUpdate(false);
  }

  async function cancelDownload() {
    setPendingAction("cancel");
    try {
      await window.clipx?.cancelUpdateDownload?.();
    } catch (err) {
      console.error("Failed to cancel update download:", err);
    } finally {
      setPendingAction(null);
    }
  }

  async function installUpdate() {
    setPendingAction("install");
    try {
      await window.clipx?.installUpdate?.();
    } catch (err) {
      console.error("Failed to install update:", err);
    } finally {
      setPendingAction(null);
    }
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
            {releaseNotesSection}
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={dismiss} disabled={pendingAction === "download"}>Not now</Button>
              <Button variant="contained" onClick={startDownload} disabled={pendingAction === "download"}>
                {pendingAction === "download" ? "Starting..." : "Update"}
              </Button>
            </div>
          </>
        )}

        {updateState.status === "downloading" && (
          <>
            <h2 id="update-modal-title">Downloading update</h2>
            <p>ClipX {updateVersion || "update"} is downloading.</p>
            <LinearProgress variant="determinate" value={progress} />
            <span className="update-progress-label">{progress}%</span>
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={cancelDownload} disabled={pendingAction === "cancel"}>
                {pendingAction === "cancel" ? "Cancelling..." : "Cancel download"}
              </Button>
            </div>
          </>
        )}

        {updateState.status === "cancelling" && (
          <>
            <h2 id="update-modal-title">Cancelling update</h2>
            <p>{updateState.message || "Stopping the update download."}</p>
            <LinearProgress />
          </>
        )}

        {updateState.status === "downloaded" && (
          <>
            <h2 id="update-modal-title">Ready to install</h2>
            <p>Restart ClipX to finish installing version {updateVersion}.</p>
            {releaseNotesSection}
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={dismiss} disabled={pendingAction === "install"}>Later</Button>
              <Button variant="contained" onClick={installUpdate} disabled={pendingAction === "install"}>
                {pendingAction === "install" ? "Restarting..." : "Restart"}
              </Button>
            </div>
          </>
        )}

        {updateState.status === "installing" && (
          <>
            <h2 id="update-modal-title">Restarting ClipX</h2>
            <p>{updateState.message || "ClipX is restarting to install the update."}</p>
            <LinearProgress />
          </>
        )}

        {updateState.status === "error" && (
          <>
            <h2 id="update-modal-title">Update failed</h2>
            <p>{updateState.message || "ClipX could not complete the update."}</p>
            <div className="update-modal-actions">
              <Button variant="outlined" onClick={dismiss} disabled={pendingAction === "download"}>Close</Button>
              <Button variant="contained" onClick={startDownload} disabled={pendingAction === "download"}>
                {pendingAction === "download" ? "Retrying..." : "Retry"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
