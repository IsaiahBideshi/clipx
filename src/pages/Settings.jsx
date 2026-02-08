import './settings.css';

import { useState, useEffect } from "react";
import DeleteIcon from '@mui/icons-material/Delete';
import TextField from "@mui/material/TextField";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import {Switch} from "@mui/material";

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


const DEFAULT_FRIENDS = [
];

export async function getTaglist() {
  if (!window.clipx?.getTaglist()) {
    console.log("no getTaglist function");
    return DEFAULT_FRIENDS;
  }

  try {
    const storedTaglist = await window.clipx.getTaglist();
    console.log(storedTaglist);
    return normalizeTaglist(storedTaglist, DEFAULT_FRIENDS);
  } catch (err) {
    console.error("Failed to load Taglist:", err);
    return DEFAULT_FRIENDS;
  }
}

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
  const [taglist, setTaglist] = useState();
  const [aliases, setAliases] = useState([""]);
  const aliasCount = aliases.length;
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null);
  const [options, setOptions] = useState();
  const [defaultOptions, setDefaultOptions] = useState();
  console.log(options);

  useEffect(() => {
    let cancelled = false;

    async function loadTaglist() {
      try {
        const loadedFriends = await getTaglist();
        setTaglist(loadedFriends);
      } catch (err) {
        console.error("Failed to load friends:", err);
        if (!cancelled) setTaglist(DEFAULT_FRIENDS);
      }
    }
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
    loadTaglist();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!window.clipx?.saveTaglist) {
      console.log("no saveTaglist function");
      return;
    }

    async function saveTaglist() {
      if (taglist === []) return;
      if (!Array.isArray(taglist)) return;

      if (!window.clipx?.saveTaglist) {
        console.log("no saveTaglist function");
        return;
      }
      try {
        await window.clipx.saveTaglist(taglist);
      } catch (err) {
        console.error("Failed to save Taglist:", err);
      }
    }
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
    saveTaglist();
  }, [taglist, options]);

  return (
    <>
      <div className={"settings-container"}>
        <h2>Settings</h2>
        <div className={"taglist"}>
          <h4 style={{marginBottom: 0}}>Add a friend</h4>

          <form action="" onSubmit={(e) => {
            e.preventDefault();
            const nextAliases = aliases.map((alias) => alias.trim()).filter(Boolean);
            if (nextAliases.length === 0) return;
            setTaglist([...taglist, { aliases: nextAliases }]);
            setAliases([""]);
          }}>
            <div className={"friend-inputs"}>
              {aliases.map((alias, index) => (
                <TextField
                  key={index}
                  label={`Friend Alias ${index + 1}`}
                  variant="outlined"
                  value={alias}
                  onChange={(e) => {
                    const next = [...aliases];
                    if (e.target.value.length > 20) return;
                    next[index] = e.target.value;
                    setAliases(next);
                  }}
                  sx={tfSx}
                />
              ))}
            </div>

            <div className={""} >
              <AddCircleIcon
                onClick={() => aliasCount < 3 ? setAliases([...aliases, ""]) : null}
                style={{
                  cursor: aliasCount < 3 ? 'pointer' : 'not-allowed',
                  verticalAlign: 'middle',
                  marginLeft: '10px',
                  opacity: aliasCount < 3 ? 1 : 0.4,
                }}
              />


              <RemoveCircleIcon onClick={() => {
                if (aliasCount > 1) setAliases(aliases.slice(0, -1))
              }}
                style={{
                  cursor: aliasCount === 1 ? 'not-allowed' : 'pointer',
                  verticalAlign: 'middle',
                  marginLeft: '10px',
                  opacity: aliasCount === 1 ? 0.4 : 1,
              }}/>
            </div>
            <br/>
            <Button variant={'contained'} type="submit" style={{marginTop: '10px'}}>Add Friend</Button>
          </form>


          <div className={"friends-list"}>
            {Array.isArray(taglist) ? (
              taglist.map((friend, index) => (
                <div key={index} className={"friend-item"}>
                  {friend.aliases.join(" / ")}
                  {pendingDeleteIndex === index ? (
                    <>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          const newFriends = taglist.filter((_, i) => i !== index);
                          setTaglist(newFriends);
                          setPendingDeleteIndex(null);
                        }}
                        sx={{ marginLeft: "8px" }}
                      >
                        <CheckIcon/>
                      </Button>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setPendingDeleteIndex(null)}
                        sx={{ marginLeft: "4px" }}
                      >
                       <CloseIcon/>
                      </Button>
                    </>
                  ) : (
                    <DeleteIcon
                      onClick={() => setPendingDeleteIndex(index)}
                      sx={{ cursor: "pointer" }}
                    />
                  )}
                </div>
              ))
            ) : (
              <div className="loading"><CircularProgress/></div>
            )}
          </div>
        </div>
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
            </FormGroup>
          )}
        </div>
      </div>
    </>
  );
}

function normalizeTaglist(storedTaglist, fallbackTaglist) {
  if (!Array.isArray(storedTaglist) || storedTaglist.length === 0) {
    return fallbackTaglist;
  }
  console.log("heer", storedTaglist);

  return storedTaglist.map((friend) => {
    if (typeof friend === "string") {
      return { aliases: [friend] };
    }
    if (friend && Array.isArray(friend.aliases)) {
      return { aliases: friend.aliases.filter(Boolean) };
    }
    return { aliases: [] };
  }).filter((friend) => friend.aliases.length > 0);
}
