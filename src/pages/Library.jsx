import {useEffect, useMemo, useRef, useState} from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import STOREDGAMES from "../data/games.json";
import { supabase } from '../lib/supabase.js';
import { useAuthSession } from "../lib/authSession.js";
import { listClips, getClipShareUrl } from "../lib/clipsApi.js";
import { isTextEntryActive } from '../lib/hotkeys.js';
import { useNavigate } from "react-router-dom";

import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import TextField from '@mui/material/TextField';
import AutoComplete from '@mui/material/Autocomplete';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import { Button, CircularProgress } from "@mui/material";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

import "./library.css";
import fallBackThumb from "../assets/thumbnail.svg";
import VideoPlayer from "../components/VideoPlayer";
import RefreshButton from "../components/RefreshButton.jsx";
import CopyLinkButton from "../components/CopyLinkButton.jsx";
import TagsAutoComplete from "../components/TagsAutoComplete.jsx";
import { formatDate } from "../components/ClipCard.jsx";
import { usePlayerPrefs } from "../lib/playerPrefs.js";

const GRID_GAP = 20;
const MIN_CARD_WIDTH = 270;
const INITIAL_SKELETON_COUNT = 20;
const LIBRARY_PAGE_SIZE = 50;
const MAX_TAG_AVATARS = 3;
const GAME_BY_ID = new Map(STOREDGAMES.map((game) => [game.id, game]));

async function fetchLibraryClips(session, filters, offset = 0) {
  if (!session?.user?.id) {
    return { clips: [], count: 0 };
  }

  const query = {
    scope: "library",
    limit: LIBRARY_PAGE_SIZE,
    offset,
  };
  if (filters.title?.trim()) {
    query.title = filters.title.trim();
  }
  if (filters.game?.id) {
    query.gameId = filters.game.id;
  }
  if (filters.owner?.id) {
    query.ownerId = filters.owner.id;
  }
  if (filters.tags?.length) {
    query.tagIds = filters.tags.filter((tag) => tag?.id).map((tag) => tag.id).join(",");
    query.tagLabels = JSON.stringify(filters.tags.filter((tag) => typeof tag === "string"));
  }

  const { data, error, count } = await listClips(session, query);
  if (error) {
    throw error;
  }

  const clips = data || [];
  let tags = [];
  if (clips.length > 0) {
    const { data: tagRows, error: tagsError } = await supabase
      .from("clip_tags")
      .select("clip_id, user_id, label")
      .in("clip_id", clips.map((clip) => clip.id));
    if (tagsError) {
      console.error("Failed to load clip tags:", tagsError);
    }
    tags = tagRows || [];
  }

  return {
    clips: clips.map((clip) => ({ ...clip, tags: tags.filter((tag) => tag.clip_id === clip.id) })),
    count: count ?? clips.length,
  };
}

function libraryClipsKey(userId, filters) {
  return [
    "library",
    "clips",
    "feed",
    userId,
    filters.title?.trim() || "",
    filters.game?.id ?? null,
    filters.owner?.id ?? null,
    (filters.tags || []).map((tag) => tag?.id ?? tag),
  ];
}

async function fetchFriendsOptions(userId) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error || !data) {
    throw error || new Error("Failed to load friendships.");
  }

  const friendIds = data.map((f) => (f.user_id === userId ? f.friend_id : f.user_id));
  if (friendIds.length === 0) {
    return [];
  }

  const { data: friendsData, error: friendsError } = await supabase
    .from("users")
    .select("id, username")
    .in("id", friendIds);

  if (friendsError || !friendsData) {
    throw friendsError || new Error("Failed to load user records for friends.");
  }

  return friendIds
    .map((friendId) => {
      const friendInfo = friendsData.find((f) => f.id === friendId);
      if (!friendInfo) return null;
      return { id: friendId, label: friendInfo.username };
    })
    .filter(Boolean);
}

async function searchOwners(query) {
  const name = String(query || "").trim();
  if (name.length < 3) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, username")
    .ilike("username", `%${name}%`)
    .limit(8);

  if (error) {
    console.error("Failed to search users:", error);
    return [];
  }

  return (data || []).map((user) => ({ id: user.id, label: user.username }));
}

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
  const [selectedClip, setSelectedClip] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftGame, setDraftGame] = useState(null);
  const [draftGameInput, setDraftGameInput] = useState("");
  const [draftTags, setDraftTags] = useState([]);
  const [gameOptions, setGameOptions] = useState([]);
  const [ownerOptions, setOwnerOptions] = useState([]);
  const [draftOwner, setDraftOwner] = useState(null);
  const [ownerInput, setOwnerInput] = useState("");
  const [filters, setFilters] = useState({ title: "", game: null, tags: [], owner: null });
  const { session, loading: loadingSession } = useAuthSession();

  const navigate = useNavigate();
  const userId = session?.user?.id;
  const clipsQuery = useInfiniteQuery({
    queryKey: libraryClipsKey(userId, filters),
    queryFn: ({ pageParam = 0 }) => fetchLibraryClips(session, filters, pageParam),
    enabled: Boolean(session),
    refetchOnMount: (query) => query.state.isInvalidated,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p?.clips?.length || 0), 0);
      return (lastPage?.count ?? 0) > loaded ? loaded : undefined;
    },
  });
  const friendsOptionsQuery = useQuery({
    queryKey: ["library", "friendsOptions", userId],
    queryFn: () => fetchFriendsOptions(userId),
    enabled: Boolean(userId),
    placeholderData: [],
  });
  const clips = useMemo(() => (clipsQuery.data?.pages || []).flatMap((p) => p?.clips || []), [clipsQuery.data]);
  const clipTotal = clipsQuery.data?.pages?.[0]?.count ?? clips.length;
  const friendsOptions = friendsOptionsQuery.data || [];
  const loadingClips = clipsQuery.isInitialLoading;

  const userIds = useMemo(
    () => Array.from(new Set(
      clips.flatMap((clip) => [clip.owner_id, ...clip.tags.map((tag) => tag.user_id)]).filter(Boolean)
    )),
    [clips]
  );
  const usersQuery = useQuery({
    queryKey: ["library", "users", userIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, avatar_url")
        .in("id", userIds);
      if (error) {
        throw error;
      }
      return data || [];
    },
    enabled: userIds.length > 0,
    placeholderData: [],
    refetchOnMount: "always",
  });
  const userMap = useMemo(
    () => Object.fromEntries((usersQuery.data || []).map((user) => [user.id, user])),
    [usersQuery.data]
  );

  const queryClient = useQueryClient();

  function moveSelectedClip(direction) {
    if (!filteredClips.length) return;

    setSelectedClip((currentClip) => {
      if (!currentClip) {
        return direction > 0 ? filteredClips[0] : filteredClips[filteredClips.length - 1];
      }

      const currentIndex = filteredClips.findIndex((item) => item.id === currentClip.id);
      if (currentIndex < 0) {
        return direction > 0 ? filteredClips[0] : filteredClips[filteredClips.length - 1];
      }

      const nextIndex = Math.max(0, Math.min(filteredClips.length - 1, currentIndex + direction));
      return filteredClips[nextIndex];
    });
  }

  const filteredClips = clips;

  useEffect(() => {
    function onKeyDown(e) {
      if (isTextEntryActive(e)) return;

      if (e.code === "Escape") {
        setSelectedClip(null);
        return;
      }

      if (selectedClip?.blob_name) return;

      if (e.code === "ArrowUp") {
        e.preventDefault();
        moveSelectedClip(-1);
      }

      if (e.code === "ArrowDown") {
        e.preventDefault();
        moveSelectedClip(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredClips, selectedClip]);

  useEffect(() => {
    if (!loadingSession && !session) {
      navigate("/login", { replace: true });
    }
  }, [loadingSession, navigate, session]);

  useEffect(() => {
    async function handleSearchGame() {
      const games = await searchGames(draftGameInput);
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
  }, [draftGameInput]);

  useEffect(() => {
    async function handleSearchOwner() {
      if (!ownerInput.trim()) {
        setOwnerOptions(userId ? [{ id: userId, label: "Me" }] : []);
        return;
      }
      const options = await searchOwners(ownerInput);
      setOwnerOptions(options);
    }

    handleSearchOwner();
  }, [ownerInput, userId]);

  function applyFilters() {
    setFilters({
      title: draftTitle.trim(),
      game: draftGame,
      tags: draftTags,
      owner: draftOwner,
    });
  }

  function clearFilters() {
    setDraftTitle("");
    setDraftGame(null);
    setDraftGameInput("");
    setDraftTags([]);
    setDraftOwner(null);
    setOwnerInput("");
    setFilters({ title: "", game: null, tags: [], owner: null });
  }


  const containerRef = useRef(null);
  const [itemsPerRow, setItemsPerRow] = useState(1);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateItemsPerRow = () => {
      const containerWidth = element.getBoundingClientRect().width;
      const nextItemsPerRow = Math.max(
        1,
        Math.floor((containerWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))
      );
      setItemsPerRow(nextItemsPerRow);
    };

    updateItemsPerRow();
    const observer = new ResizeObserver(updateItemsPerRow);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fillerCount = useMemo(() => {
    if (loadingClips || filteredClips.length === 0) return 0;

    const remainder = filteredClips.length % itemsPerRow;
    return remainder === 0 ? 0 : itemsPerRow - remainder;
  }, [filteredClips.length, itemsPerRow, loadingClips]);


  if (loadingSession || !session) {
    return (
      <CircularProgress/>
    )
  }

  return (
    <OverlayScrollbarsComponent
      className="library"
      defer
      options={{ scrollbars: { autoHide: 'scroll', theme: 'os-theme-dark' } }}
    >
      <div className="library-hero">
        <div className="library-hero-title">
          <h2>Library</h2>
          <div className="library-hero-actions">
            <div className="clip-count">{clipTotal} clip{clipTotal === 1 ? "" : "s"}</div>
            <RefreshButton onRefresh={() => clipsQuery.refetch()} />
          </div>
        </div>
      </div>
      
      <section className="search" aria-label="Search clips">
        <div className="search-head">
          <h2 className="search-title">Find a clip</h2>
          <p className="search-count"><b>{filteredClips.length}</b> of {clipTotal} match{clipTotal === 1 ? "" : "es"}</p>
        </div>
        <div className="search-grid">
          <div className="field">
            <label className="field-label" htmlFor="search-title">Clip title</label>
            <TextField
              fullWidth
              id="search-title"
              placeholder="Search by title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyFilters();
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon className="field-icon" />
                  </InputAdornment>
                ),
              }}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="search-game">Game</label>
            <AutoComplete
              id="search-game"
              options={gameOptions}
              filterOptions={(options) => options}
              freeSolo
              value={draftGame}
              inputValue={draftGameInput}
              onInputChange={(_e, newInputValue) => setDraftGameInput(newInputValue)}
              onChange={(_e, newValue) => {
                setDraftGame(newValue);
                setDraftGameInput(newValue?.label ?? "");
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
                  fullWidth
                  placeholder="Search game"
                />
              )}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="search-owner">Owner</label>
            <AutoComplete
              id="search-owner"
              options={ownerOptions}
              filterOptions={(options) => options}
              value={draftOwner}
              inputValue={ownerInput}
              onInputChange={(_e, newInputValue) => setOwnerInput(newInputValue)}
              onChange={(_e, newValue) => {
                setDraftOwner(newValue);
                setOwnerInput(newValue?.label ?? "");
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  placeholder="Search owner"
                />
              )}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="search-tags">Tags</label>
            <TagsAutoComplete
              options={friendsOptions}
              value={draftTags}
              onChange={(_e, newValue) => setDraftTags(newValue)}
              freeSolo
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  placeholder="People in the clip"
                />
              )}
            />
          </div>
        </div>
        <div className="search-actions">
          <Button variant={"contained"} onClick={applyFilters}>Filter</Button>
          <Button variant={"outlined"} onClick={clearFilters}>Clear</Button>
        </div>
        {clipsQuery.isError && (
          <p className="search-error" role="alert">{String(clipsQuery.error?.message ?? clipsQuery.error)}</p>
        )}
      </section>

      <div className="clip-grid library-clip-grid" ref={containerRef}>
        {loadingClips
          ? Array.from({ length: INITIAL_SKELETON_COUNT }).map((_, index) => (
              <ClipCardSkeleton key={`clip-skeleton-${index}`} />
            ))
          : filteredClips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                userMap={userMap}
                onSelect={setSelectedClip}
              />
            ))}
          {Array.from({ length: fillerCount }).map((_, i) => (
            <div key={`filler-${i}`} className="clip-card filler" />
          ))}
      </div>

      {clipsQuery.hasNextPage && (
        <div className="library-load-more">
          <Button
            variant="outlined"
            onClick={() => clipsQuery.fetchNextPage()}
            disabled={clipsQuery.isFetchingNextPage}
          >
            {clipsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {selectedClip && (
        <VideoPreview
          key={selectedClip.blob_name || selectedClip.youtube_video_id || selectedClip.id}
          clip={selectedClip}
          onClose={() => setSelectedClip(null)}
          onPrevClip={() => moveSelectedClip(-1)}
          onNextClip={() => moveSelectedClip(1)}
        />
      )}
    </OverlayScrollbarsComponent>
  );
}

export function ClipCardSkeleton() {
  return (
    <div className="clip-card clip-card-skeleton" aria-hidden="true">
      <div className="skeleton-thumb" />
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-date" />
    </div>
  );
}

function AzureClipThumb({clip}) {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const canFetch = Boolean(clip.thumbnail_blob_name && userId && session?.access_token);
  const thumbUrlQuery = useQuery({
    queryKey: ["library", "clipThumb", userId, clip.thumbnail_blob_name],
    queryFn: async () => {
      const apiBase = (import.meta.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");
      const res = await fetch(`${apiBase}/api/clips/stream?name=${encodeURIComponent(clip.thumbnail_blob_name)}&container=clip-thumbnails`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => null);
      const url = json?.data?.url;
      if (!res.ok || !url) {
        throw new Error(`Failed to load thumbnail (${res.status})`);
      }
      return url;
    },
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  if (thumbUrlQuery.data) {
    return <img src={thumbUrlQuery.data} alt="thumb" className="clip-thumb" />;
  }
  if (thumbUrlQuery.isError || !clip.thumbnail_blob_name) {
    return <img src={fallBackThumb} alt="thumb" className="clip-thumb" />;
  }
  return <div className="clip-thumb skeleton-thumb" />;
}


export function ClipCard({clip, userMap, onSelect}) {
  const clipDate = new Date(clip.created_at).toLocaleString( undefined, { dateStyle: 'long', timeStyle: 'short' });
  const isAzure = Boolean(clip.blob_name);
  const game = clip.game_id != null ? GAME_BY_ID.get(clip.game_id) : null;
  const owner = userMap[clip.owner_id];
  const tagged = clip.tags
    .map((tag) => (tag.user_id ? userMap[tag.user_id] : { username: tag.label }))
    .filter(Boolean);

  return (
    <div className="clip-card" onClick={() => onSelect(clip)}>
      <div className="clip-thumb-wrap">
        {isAzure ? (
          <AzureClipThumb clip={clip} />
        ) : (
          <img src={`https://img.youtube.com/vi/${clip.youtube_video_id}/mqdefault.jpg`} alt="thumb" className="clip-thumb" />
        )}
        {clip.visibility === "private" && (
          <div className="clip-private-badge" title="Private — only you can see this clip">
            <LockOutlinedIcon />
            <span>Private</span>
          </div>
        )}
        {isAzure && clip.visibility === "public" && (
          <CopyLinkButton url={getClipShareUrl(clip.id)} className="clip-copy-link" />
        )}
      </div>
      <div className="clip-name" title={clip.title}>{clip.title}</div>
      <div className="clip-meta">
        {owner && (
          <>
            <span className="clip-owner" title={`Owner: ${owner.username}`}>
              <UserAvatar user={owner} className="clip-owner-avatar" />
              <span className="clip-owner-name">{owner.username?.split(" ")[0]}</span>
            </span>
            <span>·</span>
          </>
        )}
        {game && (
          <>
            <span className="clip-game" title={game.name}>{game.name}</span>
            <span>·</span>
          </>
        )}
        <span title={clipDate}>{formatDate(clip.created_at)}</span>
      </div>
      {tagged.length > 0 && (
        <div className="clip-tagged" title={`Tagged: ${tagged.map((user) => user.username).join(", ")}`}>
          <div className="clip-tag-stack">
            {tagged.slice(0, MAX_TAG_AVATARS).map((user, index) => (
              <UserAvatar key={index} user={user} className="clip-tag-avatar" />
            ))}
            {tagged.length > MAX_TAG_AVATARS && (
              <div className="clip-tag-avatar clip-tag-more">+{tagged.length - MAX_TAG_AVATARS}</div>
            )}
          </div>
          <div className="clip-tag-label">
            {tagged.length === 1
              ? tagged[0].username
              : `${tagged[0].username?.split(" ")[0]} and ${tagged.length - 1} other${tagged.length > 2 ? "s" : ""}`}
          </div>
        </div>
      )}
    </div>
  );
}

function UserAvatar({user, className}) {
  return user.avatar_url ? (
    <img src={user.avatar_url} alt={user.username} className={className} />
  ) : (
    <div className={className} aria-hidden="true">
      {getInitials(user.username)}
    </div>
  );
}

function getInitials(name) {
  return String(name || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join("")
    .toUpperCase() || "?";
}

// Legacy Component.

export function VideoPreview({clip, onClose, onPrevClip, onNextClip}){
  const isAzure = Boolean(clip.blob_name);
  const [streamUrl, setStreamUrl] = useState(null);
  const [gamesSrc, setGamesSrc] = useState(null);
  const { session } = useAuthSession();

  const { volume, muted, setVolume, setMuted } = usePlayerPrefs();

  useEffect(() => {
    if (!isAzure || !clip.blob_name || !session?.access_token) return;

    const controller = new AbortController();

    async function fetchStreamUrl() {
      try {
        const apiBase = (import.meta.env.VITE_DATABASE_URL || "https://clipx.bideshi.tech").replace(/\/+$/, "");
        const res = await fetch(`${apiBase}/api/clips/stream?name=${encodeURIComponent(clip.blob_name)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.data?.url) {
          setStreamUrl(json.data.url);
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Failed to get stream URL:", err);
      }
    }

    fetchStreamUrl();

    return () => controller.abort();
  }, [isAzure, clip.blob_name, session?.access_token]);

  useEffect(() => {
    async function getGameImage(){
      try {
        const response = await window?.clipx?.getGameData(clip.game_id);
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

  if (isAzure) {
    return (
      <>
        <div className="library-video-preview-overlay" onClick={onClose} />
        <div className="library-video-preview">
          <button type="button" onClick={onClose} className="close-preview-btn">
            <CloseIcon fontSize={"large"} />
          </button>
          <div className="video-player-container">
            <VideoPlayer
              className="video-player-shell-fill"
              src={streamUrl || undefined}
              volume={volume}
              muted={muted}
              showSkipButtons
              onPrevClip={onPrevClip}
              onNextClip={onNextClip}
              onVolumeChange={({ volume: v, muted: m }) => {
                setVolume(v);
                setMuted(m);
              }}
            />
          </div>
          <div className="video-metadata">
            <div className="video-title-row">
              <h2 className="video-title">{clip?.title || "No Video Selected"}</h2>
              {clip.visibility === "public" && (
                <CopyLinkButton url={getClipShareUrl(clip.id)} className="video-copy-link" />
              )}
            </div>
            {gamesSrc && (<div className="video-game-row">
              <img className="video-game-image" src={gamesSrc.image} alt="game"/>
              <div className="video-game-label">{gamesSrc.label || "Unknown Game"}</div>
            </div>)}
            <div className="video-date">{clip?.created_at ? new Date(clip.created_at).toLocaleString() : "No Date Available"}</div>
          </div>
        </div>
      </>
    );
  }

  const src = `https://www.youtube.com/embed/${clip.youtube_video_id}?rel=0&modestbranding=1&autoplay=1&vq=hd1080`;

  return (
    <>
      <div className="library-video-preview-overlay" onClick={onClose} />
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
