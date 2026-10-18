import { useEffect, useState } from "react";
import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json"

import TagsAutoComplete from "./TagsAutoComplete.jsx";
import TextField from '@mui/material/TextField';
import AutoComplete from '@mui/material/Autocomplete';
import { InputLabel, MenuItem, Select, FormControl } from '@mui/material';

async function checkStoredGames(query) {
  const fuseOptions ={
    threshold: 0.3,
    keys: ["name"]
  }

  const fuse = new Fuse(STOREDGAMES, fuseOptions);
  const results = fuse.search(query);
  const resultItems = results.map(result => result.item);
  return resultItems;
}
async function searchGames(gameName) {
  if (!gameName) return [];
  if (gameName.length < 3) return [];


  const localGames = await checkStoredGames(gameName);
  if (localGames.length > 5) return localGames;

  const api = window?.clipx?.searchGames;
  if (typeof api !== "function") return [];

  try {
    const fetchedGames = await api(gameName);
    const allGames = [...localGames, ...fetchedGames];
    return allGames;
  } catch (e) {
    console.error("searchGames failed:", e);
    return [];
  }
}

export default function ClipDetailsFields({ title, onTitleChange, game, onGameChange, tags, onTagsChange, visibility, onVisibilityChange, friendsOptions }) {
  const [gameInput, setGameInput] = useState("");
  const [gameOptions, setGameOptions] = useState([]);

  useEffect(() => {
    handleSearchGame();
  }, [gameInput]);

  const handleSearchGame = async () => {
    const games = await searchGames(gameInput);
    const options = games.map(game => ({
      id: game.id,
      label: game.name + (game.first_release_date ? ` (${new Date(game.first_release_date * 1000).getFullYear()})` : ''),
      image: game?.cover?.url,
    }));

    setGameOptions(options);
  }

  return (
    <form className="upload-menu-form">
      <TextField fullWidth label={"Title"} value={title} onChange={(e) => onTitleChange(e.target.value)} />
      <div className="upload-menu-game-row" >
        <AutoComplete
          fullWidth
          disablePortal
          options={gameOptions}
          filterOptions={(options) => options}
          freeSolo
          value={game}
          onInputChange={(_e, newInputValue) => setGameInput(newInputValue)}
          onChange={(_e, newValue) => onGameChange(newValue)}
          renderOption={(props, opt) => (
            <li {...props} style={{display: "flex", alignItems: "center", gap: 10}}>
              {opt.image && (
                <img
                  src={opt.image}
                  alt={opt.label}
                  style={{width: 32, height: 45, objectFit: "cover", borderRadius: 2}}
                />
              )}
              <span>{opt.label}</span>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Game"
            />
          )}
        />
      </div>
      <TagsAutoComplete
        disablePortal
        id="tags-outlined"
        options={friendsOptions}
        value={tags}
        onChange={(_e, newValue) => onTagsChange(newValue)}
        freeSolo
        saveNewTags
        renderInput={(params) => (
          <TextField
            {...params}
            label="Tags"
            placeholder="Friends"
          />
        )}
      />
      <div style={{ display: "flex", justifyContent: "flex-start", width: "50%" }}>
        <FormControl sx={{ alignSelf: "flex-start" }} className="upload-menu-visibility-control">
          <InputLabel id="demo-simple-select-label">Visibility</InputLabel>
          <Select
            labelId="demo-simple-select-label"
            id="demo-simple-select"
            value={visibility}
            label="Visibility"
            onChange={(event) => onVisibilityChange(event.target.value)}
            sx={{width: "100%"}}
          >
            <MenuItem value={"public"}>Public</MenuItem>
            <MenuItem value={"private"}>Private</MenuItem>
            <MenuItem value={"friends"}>Friends</MenuItem>
          </Select>
        </FormControl>
      </div>
    </form>
  );
}
