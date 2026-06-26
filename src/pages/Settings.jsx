import './settings.css';

import {useEffect, useState} from "react";
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Checkbox, Switch} from "@mui/material";
import Button from "@mui/material/Button";
import { auth } from "../lib/supabase.js";

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

async function getGoogleInfo() {
  if (!window.clipx?.getGoogleInfo) {
    console.log("no getGoogleInfo function");
    return null;
  }

  try {
    const userId = await getCurrentUserId();
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

async function getCurrentUserId() {
  const { data, error } = await auth.getUser();
  if (error) {
    console.error("Failed to resolve current user:", error);
    return null;
  }
  return data?.user?.id ?? null;
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
  const [googleInfo, setGoogleInfo] = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [loadingLaunchAtStartup, setLoadingLaunchAtStartup] = useState(true);
  const [savingLaunchAtStartup, setSavingLaunchAtStartup] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [loadingGoogleInfo, setLoadingGoogleInfo] = useState(true);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [linking, setLinking] = useState(false);
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
    const info = await linkYoutube().then(() => {window.location.reload()});
    setGoogleInfo(info);
    setLoadingGoogleInfo(false);
    setLinking(false);
  }
  const handleUnlinkYoutube = async () => {
    if (!confirmUnlink) {
      setConfirmUnlink(true);
      return;
    }

    await unlinkYoutube();
    setGoogleInfo(null);
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
    async function loadGoogleInfo() {
      try {
        const info = await getGoogleInfo();
        if (!cancelled) {
          setGoogleInfo(info);
          setLoadingGoogleInfo(false);
        };
      } catch (err) {
        console.error("Failed to load Google account info:", err);
        if (!cancelled) {
          setGoogleInfo(null);
          setLoadingGoogleInfo(false);
        };
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
    loadGoogleInfo();
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
          {appVersion && (
            <div className="settings-version" aria-label={`ClipX version ${appVersion}`}>
              Version {appVersion}
            </div>
          )}
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
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(options.deleteClipAfterCut)}
                        onChange={(e) => {
                          updateOption("deleteClipAfterCut", e.target.checked);
                        }}
                      />
                    }
                    label="Delete Clip After Cut?"
                  />
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
    </>
  );
}
