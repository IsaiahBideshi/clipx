import './settings.css';

import { useState, useEffect } from "react";
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

export default function Settings() {
  const [options, setOptions] = useState();
  const [defaultOptions, setDefaultOptions] = useState();
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

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function saveOptions() {
      if (options === {}) return;
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

  return (
    <>
      <div className={"settings-container"}>
        <h2>Settings</h2>
        <div className={"options"}>
          <h4 style={{marginBottom: 0}}>Options</h4>
          {options ? null : <div className="loading"><CircularProgress/></div>}
          {options && defaultOptions && (
            <FormGroup className={"options-form"}>
              <FormControlLabel control={<Switch defaultChecked={defaultOptions?.deleteClipAfterCut} onChange={(e) => {
                setOptions({
                  ...options,
                  deleteClipAfterCut: e.target.checked,
                })
              }}/>} label="Delete Clip After Cut?"/>
              <span style={{fontWeight: "bold", color: "#90caf9"}}>{options.clipsFolder || "Not Set"}</span>
              <Button id={"pick-folder"} variant={"contained"} onClick={pickFolder}>Choose Folder</Button>
            </FormGroup>
          )}
        </div>
      </div>
    </>
  );
}
