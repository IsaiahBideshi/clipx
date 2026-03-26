import { useEffect, useState } from "react";
import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json";
import { supabase } from '../lib/supabase.js';

import CloseIcon from '@mui/icons-material/Close';
import TextField from '@mui/material/TextField';
import AutoComplete from '@mui/material/Autocomplete';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

import "./library.css";

async function checkStoredGames(query) {
  const fuseOptions = {
    threshold: 0.3,
    keys: ["name"],
  };

  const fuse = new Fuse(STOREDGAMES, fuseOptions);
  const results = fuse.search(query);
  return results.map((result) => result.item);
}

async function searchGames(gameName) {
  if (!gameName) return [];
  if (gameName.length < 3) return [];

  const localGames = await checkStoredGames(gameName);
  if (localGames.length > 5) return localGames;

  const api = window?.clipx?.searchGames;
  if (typeof api !== "function") return localGames;

  try {
    const fetchedGames = await api(gameName);
    return [...localGames, ...fetchedGames];
  } catch (e) {
    console.error("searchGames failed:", e);
    return localGames;
  }
}

export default function Library() {
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [loadingClips, setLoadingClips] = useState(true);
  const [titleQuery, setTitleQuery] = useState("");
  const [game, setGame] = useState(null);
  const [gameOptions, setGameOptions] = useState([]);
  const [gameInput, setGameInput] = useState("");
  const [friendsOptions, setFriendsOptions] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [filteredClips, setFilteredClips] = useState([]);

  console.log(clips);

  const tfSx = {
    "& .MuiInputLabel-root": { color: "#e5e7eb" },
    "& .MuiInputBase-input": { color: "#ffffff" },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.35)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.6)" },
    "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#90caf9" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#90caf9" },
    marginBottom: '10px',
    width: "100%",
  };

  useEffect(() => {
    async function loadFriendsOptions() {
      try {
        const userId = (await supabase.auth.getUser()).data.user.id;
        const { data, error } = await supabase
          .from("friendships")
          .select("user_id, friend_id")
          .eq("status", "accepted")
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (error || !data) {
          console.error("Failed to load friendships:", error);
          return;
        }

        const friendIds = data.map((f) => (f.user_id === userId ? f.friend_id : f.user_id));
        if (friendIds.length === 0) {
          setFriendsOptions([]);
          return;
        }

        const { data: friendsData, error: friendsError } = await supabase
          .from("users")
          .select("id, username")
          .in("id", friendIds);

        if (friendsError || !friendsData) {
          console.error("Failed to load user records for friends:", friendsError);
          return;
        }

        const nextOptions = friendIds
          .map((friendId) => {
            const friendInfo = friendsData.find((f) => f.id === friendId);
            if (!friendInfo) return null;
            return { id: friendId, label: friendInfo.username };
          })
          .filter(Boolean);

        setFriendsOptions(nextOptions);
      } catch (err) {
        console.error("Unexpected error loading friend options:", err);
      }
    }

    loadFriendsOptions();

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
    async function fetchClips() {
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .neq('visibility', 'private')
          .order('created_at', { ascending: false });

        if (error) {
          console.error("Error fetching clips:", error);
        } else {
          setClips(data || []);
        }
      } catch (err) {
        console.error("Unexpected error fetching clips:", err);
      } finally {
        setLoadingClips(false);
      }
    }

    fetchClips();
  }, []);

  useEffect(() => {
    async function handleSearchGame() {
      const games = await searchGames(gameInput);
      const options = games.map((entry) => ({
        id: entry.id,
        label:
          entry.name +
          (entry.first_release_date
            ? ` (${new Date(entry.first_release_date * 1000).getFullYear()})`
            : ""),
        image: entry?.cover?.url,
      }));
      setGameOptions(options);
    }

    handleSearchGame();
  }, [gameInput]);

  useEffect(() => {
    let cancelled = false;

    async function applyFilters() {
      const normalizedTitle = titleQuery.trim().toLowerCase();
      const friendIds = new Set(selectedFriends.map((friend) => friend.id));

      const mapped = await Promise.all(
        clips.map(async (clip) => {
          if (normalizedTitle && !String(clip.title || "").toLowerCase().includes(normalizedTitle)) {
            return null;
          }

          if (game?.id && clip.game_id !== game.id) {
            return null;
          }

          if (friendIds.size > 0) {
            const { data: clipWithFriendIds, error: clipTagsError } = await supabase
              .from("clip_tags")
              .select("user_id")
              .eq("clip_id", clip.id);

            if (!clipTagsError && clipWithFriendIds) {
              const clipFriendIds = new Set(clipWithFriendIds.map((tag) => tag.user_id));
              const hasFriend = Array.from(friendIds).some((friendId) => clipFriendIds.has(friendId));
              if (!hasFriend) {
                return null;
              }
            }
          }

          return clip;
        })
      );

      if (!cancelled) {
        setFilteredClips(mapped.filter(Boolean));
      }
    }

    applyFilters();

    return () => {
      cancelled = true;
    };
  }, [clips, game, selectedFriends, titleQuery]);




  return (
    <OverlayScrollbarsComponent
      className="library"
      defer
      options={{ scrollbars: { autoHide: 'scroll', theme: 'os-theme-dark' } }}
    >
      <div className="library-hero">
        <div>
          <p className="eyebrow">Discover</p>
          <h2>Library</h2>
          <p className="hero-copy">Browse uploaded clips and preview details before opening full playback.</p>
        </div>
      </div>
      
      <div className="filtering-container">
        <div className="search-bar">
          <TextField
            sx={tfSx}
            label="Clip title"
            placeholder="Search by clip title"
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
          />
        </div>
        <div className="search-bar filter-search-bar">
          <AutoComplete
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
              <li {...props} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {opt.image && (
                  <img
                    src={opt.image}
                    alt={opt.label}
                    style={{ width: 32, height: 45, objectFit: "cover", borderRadius: 2 }}
                  />
                )}
                <span>{opt.label}</span>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                sx={tfSx}
                label="Game"
                placeholder="Search game"
              />
            )}
          />

          <AutoComplete
            multiple
            options={friendsOptions}
            value={selectedFriends}
            onChange={(_e, newValue) => setSelectedFriends(newValue)}
            filterSelectedOptions
            renderInput={(params) => (
              <TextField
                {...params}
                sx={tfSx}
                label="Friends"
                placeholder="Search friends"
              />
            )}
          />
        </div>
      </div>

      <div className="clip-grid library-grid">
          {loadingClips
            ? Array.from({ length: 16 }).map((_, index) => (
                <ClipCardSkeleton key={`clip-skeleton-${index}`} />
              ))
            : filteredClips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  onSelect={setSelectedClip}
                />
              ))}
      </div>

      {selectedClip && <VideoPreview clip={selectedClip} onClose={() => setSelectedClip(null)} />}
    </OverlayScrollbarsComponent>
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