import { useEffect, useState } from "react";

import TagsAutoComplete from "./TagsAutoComplete.jsx";
import TextField from '@mui/material/TextField';
import AutoComplete from '@mui/material/Autocomplete';
import { InputLabel, MenuItem, Select, FormControl } from '@mui/material';
import { searchGames } from "../lib/gameSearch.js";
import { useSearch } from "../lib/search.js";
import SearchField from "./SearchField.jsx";

export default function ClipDetailsFields({ title, onTitleChange, game, onGameChange, tags, onTagsChange, visibility, onVisibilityChange, friendsOptions }) {
  const [gameInput, setGameInput] = useState("");
  const { options: gameOptions, loading: loadingGames } = useSearch(gameInput, searchGames);

  useEffect(() => {
    if (!game) {
      setGameInput("");
    }
  }, [game]);

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
          inputValue={gameInput}
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
            <SearchField
              {...params}
              loading={loadingGames}
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
