import './settings.css';

import {useEffect, useState} from "react";
import { useQueryClient } from "@tanstack/react-query";
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Checkbox, Switch} from "@mui/material";
import Button from "@mui/material/Button";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import changelog from "../../CHANGELOG.md?raw";
import ChangelogModal from "../components/ChangelogModal.jsx";


export async function getOptions() {
  if (!window.clipx?.getOptions) {
    return {};
  }

  try {
    const storedOptions = await window.clipx.getOptions();
    return storedOptions || {};
  } catch (err) {
    console.error("Failed to load options:", err);
    return {};
  }
}

const UPDATE_BUSY_STATUSES = new Set(["checking", "available", "downloading", "installing"]);

const UPDATE_STATUS_MESSAGES = {
  checking: "Checking for updates...",
  available: "Downloading update...",
  downloading: "Downloading update...",
  downloaded: "Update ready to install.",
  installing: "Restarting to install the update...",
  "not-available": "You're on the latest version.",
};

function getUpdateStatusMessage(updateState) {
  if (updateState?.status === "error") {
    return updateState.message || "Update check failed.";
  }

  return UPDATE_STATUS_MESSAGES[updateState?.status] || null;
}

async function getUpdateState() {
  if (!window.clipx?.getUpdateState) {
    return null;
  }

  try {
    return await window.clipx.getUpdateState();
  } catch (err) {
    console.error("Failed to load update state:", err);
    return null;
  }
}

async function getLaunchAtStartup() {
  if (!window.clipx?.getLaunchAtStartup) {
    return false;
  }

  try {
    return Boolean(await window.clipx.getLaunchAtStartup());
  } catch (err) {
    console.error("Failed to load launch at startup setting:", err);
    return false;
  }
}

export default function Settings() {
  const [options, setOptions] = useState();
  const [defaultOptions, setDefaultOptions] = useState();
  const [updateState, setUpdateState] = useState(null);
  const appVersion = updateState?.currentVersion || null;
  const updateStatusMessage = getUpdateStatusMessage(updateState);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [loadingLaunchAtStartup, setLoadingLaunchAtStartup] = useState(true);
  const [savingLaunchAtStartup, setSavingLaunchAtStartup] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const queryClient = useQueryClient();

  function updateOption(key, value) {
    setOptions((prevOptions) => ({
      ...(prevOptions || {}),
      [key]: value,
    }));
  }

  function pickFolder() {
    if (!window.clipx?.pickFolder) {
      return;
    }

    window.clipx.pickFolder().then((folderPath) => {
      if (folderPath) {
        setOptions((prevOptions) => ({
          ...prevOptions,
          clipsFolder: folderPath,
        }));
      }
    }).catch((err) => {
      console.error("Failed to pick folder:", err);
    });
  }

  async function handleLaunchAtStartupChange(event) {
    const nextLaunchAtStartup = event.target.checked;
    setLaunchAtStartup(nextLaunchAtStartup);

    if (!window.clipx?.setLaunchAtStartup) {
      return;
    }

    setSavingLaunchAtStartup(true);
    try {
      const enabled = await window.clipx.setLaunchAtStartup(nextLaunchAtStartup);
      setLaunchAtStartup(Boolean(enabled));
    } catch (err) {
      console.error("Failed to save launch at startup setting:", err);
      setLaunchAtStartup(!nextLaunchAtStartup);
    } finally {
      setSavingLaunchAtStartup(false);
    }
  }

  async function handleCheckForUpdates() {
    if (updateState?.status === "downloaded") {
      window.clipx?.installUpdate?.();
      return;
    }

    if (!window.clipx?.checkForUpdates) {
      return;
    }

    try {
      setUpdateState(await window.clipx.checkForUpdates());
    } catch (err) {
      console.error("Failed to check for updates:", err);
      setUpdateState((prevState) => ({ ...prevState, status: "error", message: "Failed to check for updates." }));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const loadedOptions = await getOptions();
        setDefaultOptions(loadedOptions);
        setOptions(loadedOptions);
      } catch (err) {
        console.error("Failed to load options:", err);
        if (!cancelled) setOptions({});
      }
    }
    async function loadUpdateState() {
      const state = await getUpdateState();
      if (!cancelled) {
        setUpdateState(state);
      }
    }
    async function loadLaunchAtStartup() {
      try {
        const enabled = await getLaunchAtStartup();
        if (!cancelled) {
          setLaunchAtStartup(enabled);
          setLoadingLaunchAtStartup(false);
        }
      } catch (err) {
        console.error("Failed to load launch at startup setting:", err);
        if (!cancelled) {
          setLaunchAtStartup(false);
          setLoadingLaunchAtStartup(false);
        }
      }
    }

    loadOptions();
    loadUpdateState();
    loadLaunchAtStartup();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window.clipx?.onUpdateState !== "function") {
      return undefined;
    }

    return window.clipx.onUpdateState(setUpdateState);
  }, []);

  useEffect(() => {
    async function saveOptions() {
      if (!options) return;
      if (typeof options !== "object") return;
      if (!window.clipx?.saveOptions) {
        return;
      }
      try {
        await window.clipx.saveOptions(options);
      } catch (err) {
        console.error("Failed to save options:", err);
      }
    }

    saveOptions();
  }, [options]);

  useEffect(() => {
    if (typeof window.clipx?.onOptionsChanged !== "function") {
      return undefined;
    }

    return window.clipx.onOptionsChanged((event) => {
      if (!event || typeof event.clipsFolder !== "string") {
        return;
      }

      queryClient.refetchQueries({ queryKey: ["localFiles", "options"] });
    });
  }, [queryClient]);

  return (
    <>
      <div className={"settings-container settings-page"}>
        <div className="settings-hero">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Settings</h2>
          </div>
          <div className="settings-version-actions">
            {appVersion && (
              <div className="settings-version" aria-label={`ClipX version ${appVersion}`}>
                Version {appVersion}
              </div>
            )}
            <Button
              className="settings-changelog-button"
              variant="outlined"
              size="small"
              startIcon={<ArticleOutlinedIcon fontSize="small" />}
              onClick={() => setShowChangelog(true)}
            >
              View changelog
            </Button>
          </div>
        </div>

        {!options ? (
          <div className="state-loader">
            <CircularProgress/>
          </div>
        ) : (
          <div className="settings-grid">
            <section className="settings-card">
              <h4>General Options</h4>
              {options && defaultOptions && (
                <FormGroup className={"options-form"}>
                  {/* <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(options.deleteClipAfterCut)}
                        onChange={(e) => {
                          updateOption("deleteClipAfterCut", e.target.checked);
                        }}
                      />
                    }
                    label="Delete Clip After Cut?"
                  /> */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(options.minimizeToTrayOnClose)}
                        onChange={(e) => {
                          updateOption("minimizeToTrayOnClose", e.target.checked);
                        }}
                      />
                    }
                    label="Minimize to tray on close"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={launchAtStartup}
                        disabled={loadingLaunchAtStartup || savingLaunchAtStartup || !window.clipx?.setLaunchAtStartup}
                        onChange={handleLaunchAtStartupChange}
                      />
                    }
                    label="Launch at startup"
                  />
                </FormGroup>
              )}
            </section>

            <section className="settings-card">
              <h4>Storage</h4>
              <div className="folder-row">
                <span className="folder-path">{options.clipsFolder || "Not Set"}</span>
                <Button id={"pick-folder"} variant={"contained"} onClick={pickFolder}>Choose Folder</Button>
              </div>
            </section>
          </div>
        )}
      </div>
      {showChangelog && (
        <ChangelogModal
          changelog={changelog}
          currentVersion={appVersion}
          onClose={() => setShowChangelog(false)}
        >
          {updateStatusMessage && (
            <span className="settings-update-status" role="status">{updateStatusMessage}</span>
          )}
          <Button
            variant="outlined"
            disabled={UPDATE_BUSY_STATUSES.has(updateState?.status) || !window.clipx?.checkForUpdates}
            onClick={handleCheckForUpdates}
          >
            {updateState?.status === "downloaded" ? "Restart to update" : "Check for updates"}
          </Button>
        </ChangelogModal>
      )}
    </>
  );
}
