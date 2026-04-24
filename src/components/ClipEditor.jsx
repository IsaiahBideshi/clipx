import { useRef, useState, useEffect } from "react";
import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json"

import EditorTimeline from "./EditorTimeline.jsx";
import VideoPreview from "./VideoPreview";
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import AutoComplete from '@mui/material/Autocomplete';
import { supabase } from "../lib/supabase.js";
import { InputLabel, MenuItem, Select, FormControl } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';



export default function ClipEditor({clip, onSaveQueueEvent, onUploadQueueEvent, isSavedClipsView = false, onClose}) {
  const videoRef = useRef(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const [clipData, setClipData] = useState(null);

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

  useEffect( () => {
    async function loadClipData() {
      if (!clip?.id) return;
      if (!window.clipx?.getClipData) {
        console.error("window.clipx.getClipData is not available (preload not wired?)");
        return;
      }
      try {
        const data = await window.clipx.getClipData(clip?.path);
        setClipData(data);
      } catch (err) {
        console.error("Failed to load clip data:", err);
      }
    }

    loadClipData();
  }, [clip]);


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
        <button className={"close-preview-btn"} onClick={onClose}>
          <CloseIcon fontSize={"large"} />
        </button>
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
        {isSavedClipsView && clipData && (
          <div className={"clip-info"}>
            <h2 className="clip-info-title">{clip?.name || "Untitled Clip"}</h2>
            <div className="clip-info-game-row">
              <img className="clip-info-game-image" src={`https:${clipData?.game?.image}`} alt="game"/>
              <div className="clip-info-game-label">{clipData?.game?.label || "Unknown Game"}</div>
            </div>
            <div className="clip-info-date">{new Date(clipData?.createdAt).toLocaleString() || "Unknown Date"}</div>
          </div>
        )}

        {!isSavedClipsView && (
          <EditorTimeline
            duration={duration}
            currentTime={currentTime}
            inPoint={inPoint}
            outPoint={outPoint}
            onSeek={seek}
            onSetIn={setInPoint}
            onSetOut={setOutPoint}
          />
        )}
      </div>

      {!isSavedClipsView && (
        <div className="upload-container">
          <UploadMenu
            clip={clip}
            start={inPoint}
            end={outPoint}
            onSaveQueueEvent={onSaveQueueEvent}
            onUploadQueueEvent={onUploadQueueEvent}
          />
        </div>
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


function UploadMenu({clip, start, end, onSaveQueueEvent, onUploadQueueEvent}) {
  const [tags, setTags] = useState([]);
  const [friendsInClip, setFriendsInClip] = useState([]);
  const [peopleInput, setPeopleInput] = useState('');
  const [session, setSession] = useState(null);
  const [game, setGame] = useState(null);
  const [clipTitle, setClipTitle] = useState("");
  const [gameInput, setGameInput] = useState("");
  const [gameOptions, setGameOptions] = useState([{ id: "testgame", label: "Test Game"},]);
  const [storedGamesLabels, setStoredGamesLabels] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [visibility, setVisibility] = useState("private");
  const [friendsOptions, setFriendsOptions] = useState([]);

  const handleChange = (event) => {
    setVisibility(event.target.value);
  };

useEffect(() => {
  async function loadFriends() {
    const userId = (await supabase.auth.getUser()).data.user.id;
    console.log("userId", userId);
    const { data, error } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .eq("status", "accepted")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) {
      console.error("Failed to load friendships:", error);
      return;
    }

    console.log("friendships", data);
    let friendIds = data.map(f => (f.user_id === userId ? f.friend_id : f.user_id));
    console.log("friendIds", friendIds);

    const { data: friendsData, error: friendsError } = await supabase
      .from("users")
      .select("id, username")
      .in("id", friendIds)

    console.log("friends data", friendsData);

    let friendsOptionsArr = [];
    for (const friendship of data) {
      const friendId = friendship.user_id === userId ? friendship.friend_id : friendship.user_id;
      const friendInfo = friendsData.find(f => f.id === friendId);
      if (friendInfo) {
        friendsOptionsArr.push({ id: friendId, label: friendInfo.username });
      }
    }
    setFriendsOptions(friendsOptionsArr);
  }

  loadFriends();
}, []);

  useEffect(() => {
    async function getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Failed to get session:", error);
      } else {
        setSession(data.session);
      }
    }

    getSession();
  }, []);

  useEffect(() => {
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

  async function saveClipRecord(clipData) {
    const id = (await supabase.auth.getUser()).data.user.id;
  
    const { data, error } = await supabase
    .from('clips')
    .insert({
      owner_id: id,
      youtube_video_id: clipData.youtubeID || "",
      title: clipData.title,
      description: "",
      visibility: clipData.visibility,
      game_id: clipData.game?.id,
      created_at: new Date().toISOString(),
    });
    if (error) {
      return error;
    }
    return null;
  }

  async function uploadClip(clip, start, end, title, game, tags) {
    if (!window?.clipx?.uploadClip) {
      console.error("window.clipx.uploadClip is not available (preload not wired?)");
      return;
    }
    setUploading(true);

    const uploadId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const displayName = title?.trim() || clip?.name || "Untitled Clip";
    onUploadQueueEvent?.({ type: "started", id: uploadId, name: displayName });

    try {
      const response = await window.clipx.uploadClip({ clip, start, end, title, game, tags, userId: session?.user?.id });
      if (response?.status === 200) {
        onUploadQueueEvent?.({
          type: "success",
          id: uploadId,
          youtubeUrl: response.youtubeUrl,
          videoId: response.videoId,
        });

        const error  = await saveClipRecord({
          id: uploadId,
          name: displayName,
          game: game,
          tags: tags,
          clip: clip,
          title: title,
          youtubeID: response.videoId,
          visibility: visibility,
          userId: session?.user?.id,
        });
        if (error) console.error("Failed to save clip record to database:", error);
        else console.log("Clip record saved");
        return;
      }

      onUploadQueueEvent?.({ type: "failed", id: uploadId });
    } catch (err) {
      if (err.message === "No linked YouTube account. Link your account in settings first.") {
        onUploadQueueEvent?.({ type: "failed", id: uploadId, error: "No linked YouTube account. Link your account in settings first." });
        console.error("Failed to upload clip:", err);
        return;
      }
      console.error("Failed to upload clip:", err);
      onUploadQueueEvent?.({ type: "failed", id: uploadId });
    } finally {
      setUploading(false);
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
      <div className="upload-menu-header">
        <p className="eyebrow">Publish</p>
        <h4>Upload Details</h4>
      </div>
      <form className="upload-menu-form">
        <TextField fullWidth label={"Title"} className={"tf-sx"} value={clipTitle} onChange={(e) => setClipTitle(e.target.value)} />
        <div className="upload-menu-game-row" >
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
          options={friendsOptions}
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
        <div style={{ display: "flex", justifyContent: "flex-start", width: "50%" }}>
          <FormControl sx={{ alignSelf: "flex-start" }} className="upload-menu-visibility-control">
            <InputLabel id="demo-simple-select-label" sx={{color: "white"}} >Visibility</InputLabel>
            <Select
              className={"tf-sx"}
              labelId="demo-simple-select-label"
              id="demo-simple-select"
              value={visibility}
              label="Visibility"
              onChange={handleChange}
              sx={{width: "100%"}}
            >
              <MenuItem value={"public"}sx={{width: "100%"}}>Public</MenuItem>
              <MenuItem value={"private"} sx={{width: "100%"}}>Private</MenuItem>
              <MenuItem value={"friends"}sx={{width: "100%"}}>Friends</MenuItem>
            </Select>
          </FormControl>
        </div>
      </form>
      <div className="upload-menu-actions">
          {session && (
            <Button
              sx={{marginRight: "10px"}}
              variant={"contained"}
              onClick={() => {uploadClip(clip, start, end, clipTitle, game, tags)}}
              disabled={uploading}
            >
            Upload Clip
          </Button>)}
        <Button variant={session ? "outlined" : "contained"} onClick={() => {saveClip(clip, start, end, clipTitle, game, tags)}} >Save Clip</Button>
      </div>
    </div>
  );
}
