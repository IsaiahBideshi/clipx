import './settings.css';

import {useEffect, useState} from "react";
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Switch} from "@mui/material";
import Button from "@mui/material/Button";
import { auth } from "../lib/supabase.js";
import { useNavigate } from "react-router-dom";

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

export default function Settings() {
  const navigate = useNavigate();
  const [options, setOptions] = useState();
  const [defaultOptions, setDefaultOptions] = useState();
  const [googleInfo, setGoogleInfo] = useState(null);
  const [loadingGoogleInfo, setLoadingGoogleInfo] = useState(true);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  console.log(options);

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

  console.log(googleInfo);

  const handleLinkYoutube = async () => {
    const info = await linkYoutube();
    setGoogleInfo(info);
    setLoadingGoogleInfo(false);
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

    loadOptions();
    loadGoogleInfo();
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

  return (
    <>
      <div className={"settings-container settings-page"}>
        <div className="settings-hero">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Settings</h2>
            <p className="hero-copy">Configure your editing defaults and connected services for a smoother workflow.</p>
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
                  <FormControlLabel
                    control={
                      <Switch
                        defaultChecked={defaultOptions?.deleteClipAfterCut}
                        onChange={(e) => {
                          setOptions({
                            ...options,
                            deleteClipAfterCut: e.target.checked,
                          })
                        }}
                      />
                    }
                    label="Delete Clip After Cut?"
                  />
                </FormGroup>
              )}
              <div className="folder-row" style={{ marginTop: "14px" }}>
                <span className="folder-path">Account security</span>
                <Button variant={"outlined"} onClick={() => navigate("/change-password")}>Change Password</Button>
              </div>
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
                      <img className="yt-avatar" src={googleInfo.picture} alt="Google profile"/>
                      <p>{googleInfo.name}</p>
                    </>
                  )}

                  {loadingGoogleInfo && (
                    <div className="loading"><CircularProgress/></div>
                  )}
                </div>

                <div className={"yt-btns"}>
                  {!(loadingGoogleInfo || googleInfo) && (<Button variant={"contained"} onClick={handleLinkYoutube}>Link</Button>)}

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
