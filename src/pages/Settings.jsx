import './settings.css';

import {useEffect, useState} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Checkbox, FormControl, InputLabel, MenuItem, Select, Switch} from "@mui/material";
import Button from "@mui/material/Button";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import changelog from "../../CHANGELOG.md?raw";
import ChangelogModal from "../components/ChangelogModal.jsx";
import { getCurrentUserId, useAuthSession } from "../lib/authSession.js";
import { toAccelerator } from "../lib/hotkeys.js";

const DEFAULT_CLIP_HOTKEY = "Alt+F8";
const DEFAULT_CLIP_SECONDS = 30;
const CLIP_LENGTHS = [15, 30, 60, 120];

function getClippingStatusMessage(clippingState) {
  switch (clippingState?.status) {
    case "installing":
      return clippingState.progress >= 100 ? "Installing OBS..." : `Downloading OBS... ${clippingState.progress || 0}%`;
    case "starting":
      return "Starting OBS...";
    case "ready":
      return "Ready. Press your hotkey to save a clip.";
    case "error":
      return clippingState.message || "Clipping failed to start.";
    default:
      return null;
  }
}


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

function googleInfoQueryKey(userId) {
  return ["settings", "googleInfo", userId || null];
}

async function getGoogleInfo(userId) {
  if (!window.clipx?.getGoogleInfo) {
    return null;
  }

  try {
    if (!userId) {
      return null;
    }
    return await window.clipx.getGoogleInfo(userId);
  }
  catch (err) {
    console.error("Failed to get Google account info:", err);
    return null;
  }
}

export async function linkYoutube() {
    if (!window.clipx?.linkYoutube) {
      return null;
    }

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error("No authenticated user found");
      }
      return await window.clipx.linkYoutube(userId);
    }
    catch (err) {
      console.error("Failed to link Youtube account:", err);
      throw err;
    }
}

async function unlinkYoutube() {
    if (!window.clipx?.unlinkYoutube) {
      return;
    }

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error("No authenticated user found");
      }
      await window.clipx.unlinkYoutube(userId);
    }
    catch (err) {
      console.error("Failed to unlink Youtube account:", err);
      throw err;
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
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [linking, setLinking] = useState(false);
  const [youtubeError, setYoutubeError] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [clippingState, setClippingState] = useState(null);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const clippingStatusMessage = getClippingStatusMessage(clippingState);
  const { session } = useAuthSession();
  const userId = session?.user?.id || null;
  const queryClient = useQueryClient();
  const googleInfoKey = googleInfoQueryKey(userId);
  const googleInfoQuery = useQuery({
    queryKey: googleInfoKey,
    queryFn: () => getGoogleInfo(userId),
    enabled: Boolean(userId),
    placeholderData: null,
  });
  const googleInfo = googleInfoQuery.data || null;
  const loadingGoogleInfo = Boolean(userId) && googleInfoQuery.isFetching && !googleInfo;

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

  function handleHotkeyKeyDown(event) {
    if (!capturingHotkey) {
      return;
    }

    event.preventDefault();
    if (event.key === "Escape") {
      setCapturingHotkey(false);
      return;
    }

    const accelerator = toAccelerator(event);
    if (accelerator) {
      updateOption("clipHotkey", accelerator);
      setCapturingHotkey(false);
    }
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

  const handleLinkYoutube = async () => {
    setLinking(true);
    setYoutubeError(null);
    try {
      const info = await linkYoutube();
      const nextUserId = userId || await getCurrentUserId();
      const nextGoogleInfoKey = googleInfoQueryKey(nextUserId);
      if (info) {
        queryClient.setQueryData(nextGoogleInfoKey, info);
      }
      await queryClient.invalidateQueries({ queryKey: nextGoogleInfoKey });
    } catch (err) {
      setYoutubeError(err?.message || "Failed to link YouTube account.");
    } finally {
      setLinking(false);
    }
  }
  const handleUnlinkYoutube = async () => {
    if (!confirmUnlink) {
      setConfirmUnlink(true);
      return;
    }

    setYoutubeError(null);
    try {
      await unlinkYoutube();
      queryClient.setQueryData(googleInfoKey, null);
      setConfirmUnlink(false);
    } catch (err) {
      setYoutubeError(err?.message || "Failed to unlink YouTube account.");
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
    if (typeof window.clipx?.onClippingState !== "function") {
      return undefined;
    }

    window.clipx.getClippingState().then(setClippingState).catch((err) => {
      console.error("Failed to load clipping state:", err);
    });
    return window.clipx.onClippingState(setClippingState);
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

  useEffect(() => {
    if (!googleInfo) {
      setConfirmUnlink(false);
    }
  }, [googleInfo]);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [googleInfo?.picture, googleInfo?.picture_data_url]);

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

            <section className="settings-card clipping-card">
              <h4>Clipping</h4>
              <p className="card-copy">
                Press a hotkey to save the last few seconds of your screen to your clips folder.
                Turning this on downloads OBS Studio (about 220 MB) the first time.
              </p>
              <FormGroup className={"options-form"}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(options.clippingEnabled)}
                      disabled={!options.clipsFolder}
                      onChange={(e) => {
                        updateOption("clippingEnabled", e.target.checked);
                      }}
                    />
                  }
                  label="Enable clipping"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(options.clipRecordMic)}
                      onChange={(e) => {
                        updateOption("clipRecordMic", e.target.checked);
                      }}
                    />
                  }
                  label="Record microphone"
                />
              </FormGroup>
              <div className="clipping-row">
                <Button
                  variant={"outlined"}
                  data-disable-global-hotkeys
                  onClick={() => setCapturingHotkey(true)}
                  onKeyDown={handleHotkeyKeyDown}
                  onBlur={() => setCapturingHotkey(false)}
                >
                  {capturingHotkey ? "Press a hotkey..." : `Hotkey: ${options.clipHotkey || DEFAULT_CLIP_HOTKEY}`}
                </Button>
                <FormControl size="small">
                  <InputLabel id="clip-length-label">Clip length</InputLabel>
                  <Select
                    labelId="clip-length-label"
                    label="Clip length"
                    value={options.clipSeconds || DEFAULT_CLIP_SECONDS}
                    onChange={(e) => updateOption("clipSeconds", e.target.value)}
                  >
                    {CLIP_LENGTHS.map((seconds) => (
                      <MenuItem key={seconds} value={seconds}>{seconds} seconds</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
              {!options.clipsFolder && (
                <p className="card-copy">Choose a clips folder in Storage to turn on clipping.</p>
              )}
              {clippingStatusMessage && (
                <p className="card-copy" style={clippingState?.status === "error" ? { color: "#ff9b9b" } : undefined}>
                  {clippingStatusMessage}
                </p>
              )}
              {clippingState?.hotkeyError && (
                <p className="card-copy" style={{ color: "#ff9b9b" }}>{clippingState.hotkeyError}</p>
              )}
              <p className="card-copy clipping-credit">Recording powered by OBS Studio (GPLv2).</p>
            </section>

            <section className="settings-card yt-card">
              <h4>YouTube</h4>
              <p className="card-copy">Link your YouTube account to upload clips directly from ClipX.</p>

              <div className={"yt"}>
                <div className="yt-profile" style={{color: "#90caf9"}}>
                  {googleInfo && (
                    <>
                      {(!avatarLoadError && (googleInfo.picture_data_url || googleInfo.picture)) && (
                        <img
                          className="yt-avatar"
                          src={googleInfo.picture_data_url || googleInfo.picture}
                          alt="Google profile"
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarLoadError(true)}
                        />
                      )}
                      <p>{googleInfo.name}</p>
                    </>
                  )}

                  {loadingGoogleInfo && (
                    <div className="loading"><CircularProgress/></div>
                  )}
                </div>

                <div className={"yt-btns"}>
                  {!(loadingGoogleInfo || googleInfo) && (<Button variant={"contained"} disabled={linking} onClick={handleLinkYoutube}>Link</Button>)}

                  {!(loadingGoogleInfo || !googleInfo) && (
                    !confirmUnlink ? (
                      <Button variant={"outlined"} onClick={handleUnlinkYoutube}>Unlink</Button>
                    ) : (
                      <>
                        <Button color={"error"} variant={"contained"} onClick={handleUnlinkYoutube}>
                          Confirm Unlink
                        </Button>
                        <Button variant={"text"} onClick={() => setConfirmUnlink(false)}>
                          Cancel
                        </Button>
                      </>
                    )
                  )}
                </div>

                {youtubeError && (
                  <p className="card-copy" style={{ color: "#ff9b9b", marginTop: 8 }}>
                    {youtubeError}
                  </p>
                )}
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
