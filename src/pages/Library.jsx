import { useState, useEffect } from "react";
import { supabase } from '../lib/supabase.js';

import CloseIcon from '@mui/icons-material/Close';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import "./library.css";

export default function Library() {
  const [clips, setClips] = useState(null);
  const [selectedClip, setSelectedClip] = useState(null);
  const [error, setError] = useState(null);
  const [loadingClips, setLoadingClips] = useState(true);
  const [friends, setFriends] = useState([]);

  const [filterOption, setFilterOption] = useState("title");

  const [gameId, setGameId] = useState(null);
  const [gameOptions, setGameOptions] = useState([]);
  const [gameInput, setGameInput] = useState("");

  const [name, setName] = useState();
  const [tags, setTags] = useState([]);

  const tfSx = {
    "& .MuiInputLabel-root": { color: "#e5e7eb" }, // label
    "& .MuiInputBase-input": { color: "#ffffff" }, // typed text
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
    marginBottom: '10px',
    textColor: 'white',
    width: "90%",
  }

  useEffect(() => {
    async function fetchFriends() {
      try {
        const id = (await supabase.auth.getUser()).data.user.id;
        const { data, error } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', id)
        .eq('status', 'accepted');

        if (error) {
          console.error("Error fetching friends:", error);
        } else {
          setFriends(data);
        }
      } catch (err) {
        console.error("Unexpected error fetching friends:", err);
      }
    }

    fetchFriends();

    function onKeyDown(e) {
      if (e.code === "Escape") {
        setSelectedClip(null);
      }
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    async function fetchAllClips() {
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .order('created_at', { ascending: false });

          if (error) {
            console.error("Error fetching clips:", error);
          } else {
            setClips(data);
          }
      } catch (err) {
        console.error("Unexpected error fetching clips:", err);
      } finally {
        setLoadingClips(false);
      }
    }

    async function fetchFriendsClips() {
      if (!friends || friends.length === 0) {
        setClips([]);
        setLoadingClips(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .in('owner_id', friends.map(f => f.friend_id))
          .order('created_at', { ascending: false });

          if (error) {
            console.error("Error fetching friends' clips:", error);
          } else {
            setClips(data);
          }
      } catch (err) {
        console.error("Unexpected error fetching friends' clips:", err);
      } finally {
        setLoadingClips(false);
      }
    }

    async function fetchGameClips() {
      if (!gameId) {
        setClips([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('game_id', gameId)
          .order('created_at', { ascending: false });

          if (error) {
            console.error("Error fetching game clips:", error);
          } else {
            setClips(data);
          }
      } catch (err) {
        console.error("Unexpected error fetching game clips:", err);
      } finally {
        setLoadingClips(false);
      }
    }

    switch (filterOption) {
      case "title":
        fetchAllClips();
        break;
      case "friend":
        fetchFriendsClips();
        break;
      case "game":
        fetchGameClips();
        break;
    }

  }, [friends, filterOption]);


  

  return (
    <div className="library" >
      <div className="library-hero">
        <div>
          <p className="eyebrow">Discover</p>
          <h2>Library</h2>
          <p className="hero-copy">Browse uploaded clips and preview details before opening full playback.</p>
        </div>
      </div>
      
      <div className="filtering-container">
        <div className={"search-bar"}>
          <TextField
            sx={tfSx}
            placeholder={"Search clips"}
            value={""}
            onChange={(e) => setFriendName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFriend(friendName);
              }
            }}
          />
          <div className="search-action"><SearchIcon sx={{'&:hover': {cursor: 'pointer'}}} value={name} onChange={(e) => setName(e.target.value)} fontSize={"large"} onClick={() => {addFriend(friendName); setLoadingUsers(true)}}/></div>
        </div>
        <div className="filter-options">
          Search by:
          <ToggleButtonGroup
            sx={{
              '& .MuiToggleButton-root': {
                color: "#e5e7eb",
                borderColor: "rgba(255,255,255,0.35)",
              },
              '& .MuiToggleButton-root:hover': {
                borderColor: "rgba(255,255,255,0.6)",
              },
              '& .MuiToggleButton-root.Mui-selected': {
                color: "#90caf9",
                borderColor: "#90caf9",
              },
              '& .MuiToggleButtonGroup-grouped': {
                borderColor: "rgba(255,255,255,0.35)",
              },
            }}
            color="primary"
            value={filterOption}
            exclusive
            onChange={(e, newValue) => {(newValue ? setFilterOption(newValue) : null)}}
            aria-label="Platform"
          >
            <ToggleButton sx={{borderColor: "white"}} value="title">Clip title</ToggleButton>
            <ToggleButton value="friend">Friend</ToggleButton>
            <ToggleButton value="game">Game</ToggleButton>
          </ToggleButtonGroup>
        </div>
      </div>

      <div className="clip-grid library-grid">
        {loadingClips
          ? Array.from({ length: 16 }).map((_, index) => (
              <ClipCardSkeleton key={`clip-skeleton-${index}`} />
            ))
          : clips && clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                onSelect={setSelectedClip}
              />
            ))}
      </div>

      {selectedClip && <VideoPreview clip={selectedClip} onClose={() => setSelectedClip(null)} />}
    </div>
  );
}

function ClipCardSkeleton() {
  return (
    <div className="clip-card clip-card-skeleton" aria-hidden="true">
      <div className="skeleton-thumb" />
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-date" />
    </div>
  );
}


function ClipCard({clip, onSelect}) {
  const clipDate = new Date(clip.created_at).toLocaleString( undefined, { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="clip-card" onClick={() => onSelect(clip)}>
      <img src={`https://img.youtube.com/vi/${clip.youtube_video_id}/mqdefault.jpg`} alt="thumb" className="clip-thumb" />
      <div className="clip-name">{clip.title}</div>
      <div className="clip-date">{clipDate}</div>
      {/* <div className="clip-tags">Tags: {clip.tags}</div> */}
    </div>
  );
}

function VideoPreview({clip, onClose}){
  const src = `https://www.youtube.com/embed/${clip.youtube_video_id}?rel=0&modestbranding=1&autoplay=1`;
  const [gamesSrc, setGamesSrc] = useState(null);


  useEffect(() => {
    async function getGameImage(){
      try {
        const response = await window?.clipx?.getGameData(clip.game_id);
        console.log("Game data response:", response);
        if (response) {
          setGamesSrc(response);
        }
      } catch (error) {
        console.error("Error fetching game data:", error);
      }
    }
    getGameImage();
  }, [clip.game_id]);

  useEffect(() => {
    if (gamesSrc && !gamesSrc.image) {
      console.warn("Game image is missing:", gamesSrc);
    }
  }, [gamesSrc]);

  return (
    <>
      <div className="library-video-preview-overlay" />
      <div className="library-video-preview">
        <button
          type="button"
          onClick={onClose}
          className="close-preview-btn"
        >
          <CloseIcon fontSize={"large"} />
        </button>
        <div className="video-player-container" >
          <iframe
            className="library-iframe"
            style={{borderRadius: "8px"}}
            width="1600"
            height="900"
            src={src}
            title="YouTube video player"
            frameBorder="0"
            allow="encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <div className="video-metadata">
          <h2 className="video-title">{clip?.title || "No Video Selected"}</h2>
          {gamesSrc && (<div className="video-game-row">
            <img className="video-game-image" src={gamesSrc.image} alt="game"/>
            <div className="video-game-label">{gamesSrc.label || "Unknown Game"}</div>
          </div>)}
          {/* <div className="video-tags">Tags: {clip.tags}</div> */}
          <div className="video-date">{clip?.created_at ? new Date(clip.created_at).toLocaleString() : "No Date Available"}</div>
        </div>
      </div>
    </>
  );
} 