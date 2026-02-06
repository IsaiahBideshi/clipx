import { useRef, useState, useEffect } from "react";
import Timeline from "./Timeline";
import VideoPreview from "./VideoPreview";
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import AutoComplete from '@mui/material/AutoComplete';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import SearchIcon from '@mui/icons-material/Search';
import {getTaglist} from "../pages/Settings";

const GAMES_API_KEY = '93dc6283e654485db211470c64885d60'

export default function ClipEditor({clip}) {
  const videoRef = useRef(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const durationMinutes = duration / 60;
  const durationSeconds = duration % 60;

  const currentMinutes = currentTime / 60;
  const currentSeconds = currentTime % 60;

  const [hideUploadMenu, setHideUploadMenu] = useState(false);

  // When video loads
  function handleLoadedMetadata(e) {
    const d = e.target.duration;
    setDuration(d);
    setOutPoint(d);
  }

  // When video plays
  function handleTimeUpdate(e) {
    const time = e.target.currentTime;
    console.log(time);

    setCurrentTime(time);
  }


  // Seek video
  function seek(time) {
    console.log(time);
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;

    if (el.paused || el.ended) {
      console.log("play");
      el.play();
    } else {
      console.log("pause");
      el.pause();
    }
  }

  function play() {
    const video = videoRef.current;
    if (!video) return;

    // If outside cut, snap to IN
    if (video.currentTime < inPoint || video.currentTime >= outPoint) {
      video.currentTime = inPoint;
      setCurrentTime(inPoint);
    }

    video.play();
  }

  function setVideoVolume(next) {
    const el = videoRef.current;
    const v = Math.max(0, Math.min(1, next));
    setVolume(v);

    if (el) {
      el.volume = v;
      if (v === 0) {
        el.muted = true;
        setIsMuted(true);
      } else if (el.muted) {
        el.muted = false;
        setIsMuted(false);
      }
    }
  }

  function toggleMute() {
    const el = videoRef.current;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (el) el.muted = nextMuted;
  }

  // Keyboard controls
  useEffect(() => {
    function isEditableTarget(target) {
      if (!(target instanceof HTMLElement)) return false;

      // includes MUI input/textarea, selects, and any contenteditable container
      const editable = target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
      );

      // also allow elements explicitly opting out
      const optOut = target.closest("[data-disable-global-hotkeys]");

      return !!editable || !!optOut;
    }

    function onKeyDown(e) {
      if (isEditableTarget(e.target)) return;

      if (e.key === "i") setInPoint(Math.min(currentTime, outPoint - 0.1));

      if (e.key === "o") setOutPoint(Math.max(currentTime, inPoint + 0.1));

      if (e.key === "ArrowLeft") {
        const newTime = Math.max(currentTime - 5, 0);
        if (newTime < inPoint) {
          seek(inPoint);
          return;
        }
        seek(newTime);
      };

      if (e.key === "ArrowRight") {
        const newTime = Math.min(currentTime + 5, duration);
        if (newTime > outPoint) {
          seek(outPoint);
          return;
        }
        seek(newTime);
      }

      if (e.shiftKey && e.key === "ArrowLeft") {
        const newTime = Math.max(currentTime - 1, 0);
        if (newTime < inPoint) {
          seek(inPoint);
          return;
        }
        seek(newTime);
      }

      if (e.shiftKey && e.key === "ArrowRight") {
        const newTime = Math.min(currentTime + 1, duration);
        if (newTime > outPoint) {
          seek(outPoint);
          return;
        }
        seek(newTime);
      }

      if (e.code === "Space") {
        e.preventDefault();

        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
          play();
        } else {
          video.pause();
        }
      }


      if (e.key === "i") {
        const newIn = Math.min(currentTime, outPoint - 0.1);
        setInPoint(newIn);

        if (videoRef.current.currentTime < newIn) {
          seek(newIn);
        }
      }
      if (e.key === "o") {
        const newOut = Math.max(currentTime, inPoint + 0.1);
        setOutPoint(newOut);

        if (videoRef.current.currentTime > newOut) {
          seek(newOut);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTime, duration, inPoint, outPoint]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    const onVolumeChange = () => {
      setVolume(el.volume ?? 1);
      setIsMuted(!!el.muted);
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("volumechange", onVolumeChange);



    setIsPlaying(!el.paused && !el.ended);
    onVolumeChange();

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("volumechange", onVolumeChange);
    };
  }, []);

  return (
    <div className="clip-editor-container">
      <div className={"clip-editor"}>
        <VideoPreview
          clip={clip}
          videoRef={videoRef}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onClick={togglePlay}
        />
        <div style={{display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px"}}>
          <button className={"play-button"} type="button" onClick={togglePlay}>
            {isPlaying ? <PauseIcon/> : <PlayArrowIcon/>}
          </button>

          <div style={{display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto"}}>
            <button className={"mute-button"} type="button" onClick={toggleMute} aria-pressed={isMuted}>
              {isMuted || volume === 0 ? (<VolumeOffIcon/>) :
                volume < 0.5 ? (<VolumeDownIcon/>) : (<VolumeUpIcon/>)
              }
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVideoVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
            />

            <div style={{width: "42px", fontSize: "12px", textAlign: "right", opacity: 0.8}}>
              {Math.round(volume * 100)}%
            </div>
          </div>

          <div style={{fontSize: "12px", opacity: 0.8}}>
            {`${Math.floor(currentMinutes)}:${String(Math.floor(currentSeconds)).padStart(2, '0')} / `}
            {duration && (
              `${Math.floor(durationMinutes)}:${String(Math.floor(durationSeconds)).padStart(2, '0')}`
            )}
          </div>
        </div>

        <Timeline
          duration={duration}
          currentTime={currentTime}
          inPoint={inPoint}
          outPoint={outPoint}
          onSeek={seek}
          onSetIn={setInPoint}
          onSetOut={setOutPoint}
        />
      </div>

      <div className={`hide-upload-menu-btn ${hideUploadMenu ? 'hidden-btn' : ''}`}>
        { !hideUploadMenu ? (
          <div onClick={() => setHideUploadMenu(true)}  className={"hide-upload-menu-btn"}> <ArrowForwardIosIcon style={{marginTop: "auto", marginBottom: "auto"}} /></div>
        ) : (
          <div onClick={() => setHideUploadMenu(false)} className={"hide-upload-menu-btn"}> <ArrowBackIosNewIcon/></div>
        )}
      </div>

      <div className={`upload-container ${hideUploadMenu ? 'hidden' : ''}`}>
        {!hideUploadMenu && (
          <UploadMenu />
        )}
      </div>
    </div>
  );
}

function searchGames(gameName) {
//   Get list of games from local files first then fetch from api:
  console.log(gameName);
  return;
  const games = [];

//   TBD: Fetch from local files

  // Fetch from API
  const url = `https://api.rawg.io/api/games?key=${GAMES_API_KEY}&search=${encodeURIComponent(gameName)}&page_size=5`;
  fetch(url).then(res => res.json()).then(games => {
    console.log("Fetched games from API:", games);
  })
}


function UploadMenu() {
  const [tagOptions, setTagOptions] = useState([]);
  const [tags, setTags] = useState([]);
  const [friendsInClip, setFriendsInClip] = useState([]);
  const [peopleInput, setPeopleInput] = useState('');
  const [game, setGame] = useState(null);
  const [gameInput, setGameInput] = useState("");
  const [gameOptions, setGameOptions] = useState([{ id: "testgame", label: "Test Game", img: "/vite.svg" },]);
  const tfSx = {
    "& .MuiInputLabel-root": { color: "#e5e7eb" }, // label
    "& .MuiInputBase-input": { color: "#ffffff" }, // typed text
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
    marginBottom: '10px',
    textColor: 'white',
    width: "100%",
  };

  useEffect(() => {
    let cancelled = false;

    async function loadTagOptions() {
      try {
        const taglist = await getTaglist();
        if (!Array.isArray(taglist)) return;

        const options = taglist
          .map((tag) => Array.isArray(tag?.aliases) ? tag.aliases.filter(Boolean).join(" /  ") : "")
          .filter(Boolean);

        if (!cancelled) setTagOptions(options);
      } catch (err) {
        console.error("Failed to load tag options:", err);
      }
    }

    loadTagOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearchGame = async () => {
    const games = searchGames(gameInput);
    setGame(games);
  }

  return (
    <div className="upload-menu">
      <form>
        <TextField fullWidth label={"Title"} sx={tfSx} />
        <div style={{display: "flex", justifyContent: "space-between"}} >
          <AutoComplete
            sx={{width: "100%", marginRight: '10px'}}
            options={gameOptions}
            value={game}
            inputValue={gameInput}
            onInputChange={(_e, newInputValue) => setGameInput(newInputValue)}
            onChange={(_e, newValue) => {
              setGame(newValue);
              setGameInput(newValue?.label ?? "");
            }}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            getOptionLabel={(opt) => opt?.label ?? ""}
            renderOption={(props, opt) => (
              <li {...props} style={{display: "flex", alignItems: "center", gap: 10}}>
                <img
                  src={opt.img}
                  alt=""
                  width={20}
                  height={20}
                  style={{objectFit: "contain"}}
                />
                <span>{opt.label}</span>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                sx={tfSx}
                label="Game"
              />
            )}
          />
          <SearchIcon fontSize={"large"} className={"search-game-button"} onClick={handleSearchGame} />
        </div>
        <AutoComplete
          sx={tfSx}
          multiple
          id="tags-outlined"
          options={tagOptions}
          value={tags}
          onChange={(_e, newValue) => setTags(newValue)}
          filterSelectedOptions
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tags"
              placeholder="Friends"
            />
          )}
        />
      </form>
      <Button variant={"outlined"}>Upload Clip</Button>
    </div>
  );
}
