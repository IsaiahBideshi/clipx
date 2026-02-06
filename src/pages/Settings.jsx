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

export default function Settings() {
  const [taglist, setTaglist] = useState(getTaglist());
  const [aliases, setAliases] = useState([""]);
  const aliasCount = aliases.length;
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null);

  console.log(taglist);

  useEffect(() => {
    let cancelled = false;

    async function loadTaglist() {
      try {
        const loadedFriends = await getTaglist();
        setTaglist(loadedFriends);
        if (!cancelled) getTaglist(loadedFriends);
      } catch (err) {
        console.error("Failed to load friends:", err);
        if (!cancelled) setTaglist(DEFAULT_FRIENDS);
      }
    }

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
      if (!taglist === []) return;
      console.log("saveTaglist function");
      try {
        await window.clipx.saveTaglist(taglist);
      } catch (err) {
        console.error("Failed to save Taglist:", err);
      }
    }
    saveTaglist();
  }, [taglist]);

  console.log(taglist);

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
