import { useRef, useState, useEffect } from "react";
import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json"

import EditorTimeline from "./EditorTimeline.jsx";
import VideoPreview from "./VideoPreview";
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import AutoComplete from '@mui/material/AutoComplete';

// RAWG Key: 93dc6283e654485db211470c64885d60
const GAMES_API_KEY = '93dc6283e654485db211470c64885d60';

// IGDB Key: 1b8c8d9e311a4c8d71c3c732fbbaccc
// Client ID: 31woiu66m2oeotccavjhhgaeg26jdg
// Secret: lk8frdqd9wqa687gmsx5lz0g7d0yfa
// Access Token: vkibr6jlgoaw8uh9bk9dgacdx14gjv

export default function ClipEditor({clip, onSaveQueueEvent, isSavedClipsView = false}) {
  const videoRef = useRef(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const [hideUploadMenu, setHideUploadMenu] = useState(true);

  // When video loads
  function handleLoadedMetadata(e) {
    const d = e.target.duration;
    setDuration(d);
    setOutPoint(d);
  }

  // When video plays
  function handleTimeUpdate(e) {
    const time = e.target.currentTime;
    // console.log(time);

    setCurrentTime(time);
  }


  // Seek video
  function seek(time) {
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
      if (target.closest('input[type="range"]')) return false;

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
          onTogglePlay={togglePlay}
          onSeek={seek}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          startTime={inPoint}
          endTime={outPoint}
          volume={volume}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onSetVolume={setVideoVolume}
        />
        {isSavedClipsView && (
          <div className={"clip-info"}>
            <div><strong>{clip?.name || "Untitled Clip"}</strong></div>
            <div style={{fontSize: "0.9em", color: "#ccc"}}>{clip?.game || "Unknown Game"}</div>
          {/*  date*/}
           <div style={{fontSize: "0.8em", color: "#666"}}>{new Date(clip?.createdAt).toLocaleString() || "Unknown Date"}</div>
          </div>
        )}

        {!isSavedClipsView && (<EditorTimeline
          duration={duration}
          currentTime={currentTime}
          inPoint={inPoint}
          outPoint={outPoint}
          onSeek={seek}
          onSetIn={setInPoint}
          onSetOut={setOutPoint}
        />)}
      </div>

      {!isSavedClipsView && (
        <>
          <div className={`hide-upload-menu-btn ${hideUploadMenu ? 'hidden-btn' : ''}`}>
            {!hideUploadMenu ? (
              <div onClick={() => setHideUploadMenu(true)} className={"hide-upload-menu-btn"}><ArrowForwardIosIcon
                style={{marginTop: "auto", marginBottom: "auto"}}/></div>
            ) : (
              <div onClick={() => setHideUploadMenu(false)} className={"hide-upload-menu-btn"}><ArrowBackIosNewIcon/></div>
            )}
          </div>

          <div className={`upload-container ${hideUploadMenu ? 'hidden' : ''}`}>
            {!hideUploadMenu && (
              <UploadMenu clip={clip} start={inPoint} end={outPoint} onSaveQueueEvent={onSaveQueueEvent}/>
            )}
          </div>
        </>
      )}
    </div>
  );
}

async function checkStoredGames(query) {
  const fuseOptions ={
    threshold: 0.3,
    keys: ["name"]
  }

  const fuse = new Fuse(STOREDGAMES, fuseOptions);
  const results = fuse.search(query);
  console.log(results);
  const resultItems = results.map(result => result.item);
  console.log(resultItems);
  return resultItems;
}

async function searchGames(gameName) {
  if (!gameName) return [];
  if (gameName.length < 3) return [];


  const localGames = await checkStoredGames(gameName);
  console.log(localGames.length);
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


function UploadMenu({clip, start, end, onSaveQueueEvent}) {
  const [tags, setTags] = useState([]);
  const [friendsInClip, setFriendsInClip] = useState([]);
  const [peopleInput, setPeopleInput] = useState('');
  const [game, setGame] = useState(null);
  const [clipTitle, setClipTitle] = useState("");
  const [gameInput, setGameInput] = useState("");
  const [gameOptions, setGameOptions] = useState([{ id: "testgame", label: "Test Game"},]);
  const [storedGamesLabels, setStoredGamesLabels] = useState([]);
  useEffect(() => {
    console.log("Searching games for input:", gameInput);
    handleSearchGame();
  }, [gameInput]);

  async function saveClip(clip, start, end, title, game, tags) {
    if (!window?.clipx?.saveClip) {
      console.error("window.clipx.saveClip is not available (preload not wired?)");
      return;
    }

    const saveId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const displayName = title?.trim() || clip?.name || "Untitled Clip";
    onSaveQueueEvent?.({ type: "started", id: saveId, name: displayName });

    try {
      const response = await window.clipx.saveClip({clip, start, end, title, game, tags});
      if (response === 200){
        onSaveQueueEvent?.({ type: "success", id: saveId });
        return;
      }
      onSaveQueueEvent?.({ type: "failed", id: saveId });
    } catch (err) {
      console.error("Failed to save clip:", err);
      onSaveQueueEvent?.({ type: "failed", id: saveId });
    }
  }

  const handleSearchGame = async () => {
    const games = await searchGames(gameInput);
    const options = games.map(game => ({
      id: game.id,
      label: game.name + (game.first_release_date ? ` (${new Date(game.first_release_date * 1000).getFullYear()})` : ''),
      image: game?.cover?.url,
    }));
    console.log(options);

    setGameOptions(options);
  }

  return (
    <div className="upload-menu">
      <form>
        <TextField fullWidth label={"Title"} className={"tf-sx"} value={clipTitle} onChange={(e) => setClipTitle(e.target.value)} />
        <div style={{display: "flex", justifyContent: "space-between"}} >
          <AutoComplete
            fullWidth
            options={gameOptions}
            filterOptions={(options) => options}
            freeSolo
            value={game}
            inputValue={gameInput}
            onInputChange={(_e, newInputValue) => setGameInput(newInputValue)}
            onChange={(_e, newValue) => {
              setGame(newValue);
              setGameInput(newValue?.label ?? "");
            }}
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
                className={"tf-sx"}
                label="Game"
              />
            )}
          />
        </div>
        <AutoComplete
          className={"tf-sx"}
          multiple
          id="tags-outlined"
          options={[]}
          value={tags}
          onChange={(_e, newValue) => setTags(newValue)}
          filterSelectedOptions
          freeSolo
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tags"
              placeholder="Friends"
            />
          )}
        />
      </form>
      <Button sx={{marginRight: "10px"}} variant={"contained"}>Upload Clip</Button>
      <Button variant={"outlined"} onClick={() => {saveClip(clip, start, end, clipTitle, game, tags)}} >Save Clip</Button>
    </div>
  );
}
