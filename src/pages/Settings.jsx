import './settings.css';

import {useEffect, useState} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Checkbox, Switch} from "@mui/material";
import Button from "@mui/material/Button";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import changelog from "../../CHANGELOG.md?raw";
import ChangelogModal from "../components/ChangelogModal.jsx";
import { getCurrentUserId, useAuthSession } from "../lib/authSession.js";

const tfSx = {
  "& .MuiInputLabel-root": { color: "#e5e7eb" }, // label
  "& .MuiInputBase-input": { color: "#ffffff" }, // typed text
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
  marginBottom: '10px',
  textColor: 'white',
  marginTop: '10px',
};


export async function getOptions() {
  if (!window.clipx?.getOptions) {
    console.log("no getOptions function");
    return {};
  }

  try {
    const storedOptions = await window.clipx.getOptions();
    console.log(storedOptions);
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
    console.log("no getGoogleInfo function");
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
      console.log("no linkYoutube function");
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
    }
}

async function unlinkYoutube() {
    if (!window.clipx?.unlinkYoutube) {
      console.log("no unlinkYoutube function");
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
    }
}

async function getAppVersion() {
  if (!window.clipx?.getUpdateState) {
    return null;
  }

  try {
    const updateState = await window.clipx.getUpdateState();
    return updateState?.currentVersion || null;
  } catch (err) {
    console.error("Failed to load app version:", err);
    return null;
  }
}

async function getLaunchAtStartup() {
  if (!window.clipx?.getLaunchAtStartup) {
    console.log("no getLaunchAtStartup function");
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
  const [appVersion, setAppVersion] = useState(null);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [loadingLaunchAtStartup, setLoadingLaunchAtStartup] = useState(true);
  const [savingLaunchAtStartup, setSavingLaunchAtStartup] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
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
  console.log(options);

  function updateOption(key, value) {
    setOptions((prevOptions) => ({
      ...(prevOptions || {}),
      [key]: value,
    }));
  }

  function pickFolder() {
    if (!window.clipx?.pickFolder) {
      console.log("no pickFolder function");
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
      console.log("no setLaunchAtStartup function");
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

  console.log(googleInfo);

  const handleLinkYoutube = async () => {
    setLinking(true);
    try {
      const info = await linkYoutube();
      const nextUserId = userId || await getCurrentUserId();
      const nextGoogleInfoKey = googleInfoQueryKey(nextUserId);
      if (info) {
        queryClient.setQueryData(nextGoogleInfoKey, info);
      }
      await queryClient.invalidateQueries({ queryKey: nextGoogleInfoKey });
    } finally {
      setLinking(false);
    }
  }
  const handleUnlinkYoutube = async () => {
    if (!confirmUnlink) {
      setConfirmUnlink(true);
      return;
    }

    await unlinkYoutube();
    queryClient.setQueryData(googleInfoKey, null);
    setConfirmUnlink(false);
  }
  console.log(googleInfo);
  console.log(loadingGoogleInfo);

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
    async function loadAppVersion() {
      const version = await getAppVersion();
      if (!cancelled) {
        setAppVersion(version);
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
    loadAppVersion();
    loadLaunchAtStartup();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function saveOptions() {
      if (!options) return;
      if (typeof options !== "object") return;
      if (!window.clipx?.saveOptions) {
        console.log("no saveOptions function");
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
            <p className="hero-copy">Configure your editing defaults and connected services for a smoother workflow.</p>
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
              <p className="card-copy">Choose how ClipX behaves while you edit and save clips.</p>
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
              <p className="card-copy">Pick where your rendered clips are stored on this device.</p>
              <div className="folder-row">
                <span className="folder-path">{options.clipsFolder || "Not Set"}</span>
                <Button id={"pick-folder"} variant={"contained"} onClick={pickFolder}>Choose Folder</Button>
              </div>
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
        />
      )}
    </>
  );
}
