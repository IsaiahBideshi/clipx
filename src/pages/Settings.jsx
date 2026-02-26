import './settings.css';

import {useEffect, useState} from "react";
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Switch} from "@mui/material";
import Button from "@mui/material/Button";

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
    return await window.clipx.getGoogleInfo();
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
      return await window.clipx.linkYoutube();
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
      await window.clipx.unlinkYoutube();
    }
    catch (err) {
      console.error("Failed to unlink Youtube account:", err);
    }
}

export default function Settings() {
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
      <div className={"settings-container"}>
        <h2>Settings</h2>
        <div className={"options"}>
          <div className={"menu-separator"} style={{width: "100%"}}><span>Options</span></div>
          {options ? null : <div className="loading"><CircularProgress/></div>}
          {options && defaultOptions && (
            <FormGroup className={"options-form"}>
              <FormControlLabel control={<Switch defaultChecked={defaultOptions?.deleteClipAfterCut} onChange={(e) => {
                setOptions({
                  ...options,
                  deleteClipAfterCut: e.target.checked,
                })
              }}/>} label="Delete Clip After Cut?"/>

              <div className={"menu-separator"} style={{width: "100%"}}><span>Choose Clip Folder</span></div>


              <span style={{fontWeight: "bold", color: "#90caf9"}}>{options.clipsFolder || "Not Set"}</span>
              <Button id={"pick-folder"} variant={"contained"} onClick={pickFolder}>Choose Folder</Button>

              <div className={"menu-separator"} style={{width: "100%"}}><span>Connect Youtube Account</span></div>


              <div className={"yt"}>
                <h4 style={{marginBottom: 0}}></h4>
                  <div style={{color: "#90caf9"}}>
                    {googleInfo && (
                      <>
                        <img style={{borderRadius: "100px"}} src={googleInfo.picture} alt=""/>
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

              <div className={"menu-separator"} style={{width: "100%"}}><span></span></div>


            </FormGroup>
          )}
        </div>
      </div>
    </>
  );
}
