import { useRef, useState, useEffect, useMemo } from "react";

import EditorTimeline from "./EditorTimeline.jsx";
import VideoPlayer from "./VideoPlayer";
import ClipDetailsFields from "./ClipDetailsFields.jsx";
import AudioMixer from "./AudioMixer.jsx";
import ScreenStage, { ScreenIcon } from "./ScreenStage.jsx";
import { toClipxUrl, useTrackMix } from "../lib/trackMix.js";
import { getHomeView, getScreenViews } from "../lib/screenLayout.js";
import { buildMix, getMixTracks } from "../../electron/utils/audioMix.js";
import { getManifestFile } from "../../electron/utils/clipManifest.js";
import Button from '@mui/material/Button';
import { supabase } from "../lib/supabase.js";
import { getClipTagsError, getClipShareUrl } from "../lib/clipsApi.js";
import { Divider, Menu, MenuItem, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import fallBackThumb from "../assets/thumbnail.svg";
import { usePlayerPrefs } from "../lib/playerPrefs.js";


function getEditableClipName(fileName) {
  const name = String(fileName || "");
  return name.replace(/\.(mp4|webm|mov)$/i, "");
}

function useMediaDurations(paths) {
  const [durations, setDurations] = useState({});
  const key = paths.join("|");

  useEffect(() => {
    let cancelled = false;
    setDurations({});
    const probes = paths.map((filePath) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        if (!cancelled) {
          setDurations((current) => ({ ...current, [filePath]: probe.duration }));
        }
      };
      probe.src = toClipxUrl(filePath);
      return probe;
    });

    return () => {
      cancelled = true;
      probes.forEach((probe) => probe.removeAttribute("src"));
    };
  }, [key]);

  return durations;
}

function getClipNameValidationError(value) {
  const name = String(value || "").trim();
  if (!name) {
    return "Enter a clip name.";
  }

  const baseName = getEditableClipName(name).trim();
  if (
    !baseName ||
    baseName === "." ||
    baseName === ".." ||
    /[<>:"/\\|?*\x00-\x1F]/.test(baseName) ||
    /[. ]$/.test(baseName) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName)
  ) {
    return "Clip names cannot contain \\ / : * ? \" < > | or end with a space or period.";
  }

  return "";
}


export default function ClipEditor({
  clip, 
  onNextClip,
  onPrevClip,
  onSaveQueueEvent, 
  onUploadQueueEvent, 
  onDelete, 
  isSavedClipsView = false, 
  onClose, 
  baseFolder,
  triggerClipIndexRefresh,
  onClipRenamed,
  authSession,
  uploading,
  saving
}) {
  const playerRef = useRef(null);
  const editorRef = useRef(null);
  const uploadMenuRef = useRef(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);

  const [thumbSrc, setThumbSrc] = useState(fallBackThumb);

  const { volume, muted: isMuted, setVolume, setMuted: setIsMuted } = usePlayerPrefs();

  const [clipData, setClipData] = useState(null);

  const [isEdittingClipName, setIsEdittingClipName] = useState(false);
  const [clipName, setClipName] = useState(null);
  const [clipNameError, setClipNameError] = useState("");

  const [group, setGroup] = useState(null);
  const [trackLevels, setTrackLevels] = useState({});
  const [videoRatio, setVideoRatio] = useState(16 / 9);
  const mixTracks = useMemo(() => getMixTracks(getManifestFile(group?.manifest, clip.name)?.audioTracks), [group, clip.name]);
  const mix = useMemo(() => buildMix(mixTracks, trackLevels), [mixTracks, trackLevels]);

  const [frontPath, setFrontPath] = useState(clip.path);
  const switchingRef = useRef(false);
  const views = useMemo(
    () => (group && !isSavedClipsView && group.files.some((file) => file.path === clip.path) ? getScreenViews(group.files) : []),
    [group, isSavedClipsView, clip.path]
  );
  const homeView = useMemo(() => getHomeView(views, clip.path), [views, clip.path]);
  const hasViews = views.length > 0;
  const multiScreen = views.length > 1;
  const durations = useMediaDurations(multiScreen ? group.files.map((file) => file.path) : []);
  const shifts = useMemo(() => {
    const primaryDuration = durations[clip.path];
    return Object.fromEntries(Object.entries(durations).map(([filePath, fileDuration]) => [filePath, primaryDuration ? primaryDuration - fileDuration : 0]));
  }, [durations, clip.path]);
  const activePath = multiScreen && views.some((view) => view.path === frontPath) ? frontPath : clip.path;
  const frontView = views.find((view) => view.path === activePath) || null;
  const offset = shifts[activePath] ?? 0;
  const screen = activePath !== clip.path ? { path: activePath, shift: offset } : null;
  const timelineDuration = duration + offset;
  const outEnd = Math.min(outPoint, timelineDuration);

  useTrackMix(
    playerRef,
    clip.path,
    { mix: isSavedClipsView ? null : mix, offset, external: activePath !== clip.path },
    volume,
    isMuted
  );

  useEffect(() => {
    switchingRef.current = false;
    setFrontPath(multiScreen && homeView ? homeView.path : clip.path);
  }, [hasViews, clip.path]);

  function selectView(nextPath) {
    if (nextPath === activePath) {
      return;
    }

    const player = playerRef.current;
    if (player?.element?.readyState > 0) {
      switchingRef.current = true;
      player.resumeAt(Math.max(0, player.element.currentTime + offset - (shifts[nextPath] ?? 0)), player.paused);
    }
    setFrontPath(nextPath);
  }

  function loadGroup(cancelledRef) {
    window.clipx?.getClipGroup?.(clip.path)
      .then((clipGroup) => {
        if (!cancelledRef?.cancelled) {
          setGroup(clipGroup);
        }
      })
      .catch((error) => console.error("Failed to load the clip's group:", error));
  }

  useEffect(() => {
    if (!group || typeof window.clipx?.onLocalClipIndexChanged !== "function") {
      return undefined;
    }

    return window.clipx.onLocalClipIndexChanged((event) => {
      if (event?.type === "removed" && event.clip?.path !== clip.path && group.files.some((file) => file.path === event.clip?.path)) {
        if (event.clip.path === activePath) {
          selectView(clip.path);
        }
        loadGroup();
      }
    });
  }, [group, activePath, shifts]);

  useEffect(() => {
    if (clip?.name) {
      setClipName(getEditableClipName(clip.name));
      setClipNameError("");
    }
  }, [clip]);

  useEffect(() => {
    const cancelledRef = { cancelled: false };
    setGroup(null);
    setTrackLevels({});
    loadGroup(cancelledRef);

    return () => {
      cancelledRef.cancelled = true;
    };
  }, [clip.path]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
          editorRef.current && 
          !editorRef.current.contains(event.target) && 
          uploadMenuRef.current && 
          !uploadMenuRef.current.contains(event.target) &&
          !event.target.closest?.(".MuiPopover-root, .MuiPopper-root, .clip-widgets, .delete-modal")
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // When video loads
  function handleLoadedMetadata(d) {
    setDuration(d);
    const video = playerRef.current?.element;
    if (video?.videoWidth && video.videoHeight) {
      setVideoRatio(video.videoWidth / video.videoHeight);
    }
    if (switchingRef.current) {
      switchingRef.current = false;
      return;
    }
    setInPoint(0);
    setOutPoint(Infinity);
  }

  // When video plays
  function handleTimeUpdate(time) {
    setCurrentTime(time + offset);
  }


  // Seek video
  function seek(time) {
    playerRef.current?.seek(time - offset);
  }

  // In/out point shortcuts only — all playback keys are handled inside VideoPlayer
  function handleKeyShortcut(e) {
    if (e.key === "i") {
      const newIn = Math.min(currentTime, outEnd - 0.1);
      setInPoint(newIn);

      if (playerRef.current?.currentTime + offset < newIn) {
        seek(newIn);
      }
    }
    if (e.key === "o") {
      const newOut = Math.max(currentTime, inPoint + 0.1);
      setOutPoint(newOut);

      if (playerRef.current?.currentTime + offset > newOut) {
        seek(newOut);
      }
    }
  }

  useEffect(() => {
    let mounted = true;

    function getThumbUrl(thumbPath) {
      return thumbPath ? `clipx://image?path=${encodeURIComponent(thumbPath)}` : null;
    }

    const cachedThumbUrl = getThumbUrl(clip.thumbnailPath);
    if (cachedThumbUrl) {
      setThumbSrc(cachedThumbUrl);
      return () => {
        mounted = false;
      };
    }

    setThumbSrc(fallBackThumb);

    const getThumbnail = window.clipx?.getThumbnail;
    if (typeof getThumbnail !== "function") {
      return () => {
        mounted = false;
      };
    }

    getThumbnail(clip.path, baseFolder)
      .then((thumbPath) => {
        if (mounted) {
          setThumbSrc(getThumbUrl(thumbPath));
        }
      })
      .catch((error) => {
        console.error("Failed to load thumbnail:", error);
      });

    return () => {
      mounted = false;
    };
  }, [clip, baseFolder]);

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


  return (
    <div className="clip-editor-container">
      
      <div className={"clip-editor"} tabIndex={-1} ref={editorRef}>
        <button className={"close-preview-btn"} onClick={onClose}>
          <CloseIcon fontSize={"large"} />
        </button>
        <ScreenStage
          views={views}
          frontPath={activePath}
          playerRef={playerRef}
          ratio={videoRatio}
          onSelect={selectView}
        >
          <VideoPlayer
            ref={playerRef}
            src={toClipxUrl(activePath)}
            crossOrigin="anonymous"
            poster={activePath === clip.path ? thumbSrc : undefined}
            volume={volume}
            muted={isMuted}
            startTime={inPoint - offset}
            endTime={outPoint - offset}
            showSkipButtons
            onNextClip={onNextClip}
            onPrevClip={onPrevClip}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onVolumeChange={({ volume: v, muted: m }) => {
              setVolume(v);
              setIsMuted(m);
            }}
            onKeyDown={handleKeyShortcut}
          />
        </ScreenStage>

        <Typography 
          variant="h5" 
          sx={{
            margin: "0 auto",
            width: "92%",
            textAlign: "left",
            fontWeight: "bold",
          }}
          onClick={() => setIsEdittingClipName(true)}
        >
          {clipName || "Untitled Clip"}
        </Typography>
        

        {isSavedClipsView && clipData && (
          <div className={"clip-info"}>
            <div className="clip-info-game-row">
              <img className="clip-info-game-image" src={`https:${clipData?.game?.image}`} />
              <div className="clip-info-game-label">{clipData?.game?.label || "Unknown Game"}</div>
            </div>
            <div className="clip-info-date">{new Date(clipData?.createdAt).toLocaleString() || "Unknown Date"}</div>
          </div>
        )}

        {!isSavedClipsView && (
          <EditorTimeline
            duration={timelineDuration}
            currentTime={currentTime}
            inPoint={inPoint}
            outPoint={outEnd}
            onSeek={seek}
            onSetIn={setInPoint}
            onSetOut={setOutPoint}
          />
        )}

        {!isSavedClipsView && mixTracks.length > 0 && (
          <AudioMixer tracks={mixTracks} levels={trackLevels} game={group?.manifest?.game} onChange={setTrackLevels} />
        )}
      </div>

      {!isSavedClipsView && (
        <div className="upload-container" ref={uploadMenuRef}>
          <UploadMenu
            clip={clip}
            group={group}
            mix={mix}
            screen={screen}
            target={multiScreen ? frontView : null}
            start={Math.max(0, inPoint - offset)}
            end={outEnd - offset}
            session={authSession}
            onSaveQueueEvent={onSaveQueueEvent}
            onUploadQueueEvent={onUploadQueueEvent}
            screens={multiScreen ? views : null}
            onDelete={(view, keep) => onDelete(clip, view, keep)}
            onRenamed={onClipRenamed}
            onRefreshIndex={triggerClipIndexRefresh}
            uploading={uploading}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}

export function UploadMenu({clip, group, mix, screen, screens, target, start, end, onRenamed, onRefreshIndex, onSaveQueueEvent, onUploadQueueEvent, onDelete, uploading, saving, session}) {
  const [deleteAnchor, setDeleteAnchor] = useState(null);
  const [tags, setTags] = useState([]);
  const [friendsInClip, setFriendsInClip] = useState([]);
  const [peopleInput, setPeopleInput] = useState('');
  const [game, setGame] = useState(null);
  const [clipTitle, setClipTitle] = useState("");
  const [storedGamesLabels, setStoredGamesLabels] = useState([]);
  const [visibility, setVisibility] = useState("public");
  const [friendsOptions, setFriendsOptions] = useState([]);
  const userId = session?.user?.id;
  const emptyRange = Boolean(screen) && end <= start;

  useEffect(() => {
    async function loadFriends() {
      if (!userId) {
        setFriendsOptions([]);
        return;
      }

      const { data, error } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (error) {
        console.error("Failed to load friendships:", error);
        return;
      }

      let friendIds = data.map(f => (f.user_id === userId ? f.friend_id : f.user_id));

      if (friendIds.length === 0) {
        setFriendsOptions([]);
        return;
      }

      const { data: friendsData, error: friendsError } = await supabase
        .from("users")
        .select("id, username")
        .in("id", friendIds)

      if (friendsError) {
        console.error("Failed to load friend usernames:", friendsError);
        return;
      }

      if (!friendsData) {
        setFriendsOptions([]);
        return;
      }

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
  }, [userId]);

  const detected = group?.manifest?.game;
  useEffect(() => {
    setGame(detected?.id ? { id: detected.id, label: detected.label || detected.name, image: detected.image?.replace(/^https:/, "") || null } : null);
  }, [clip.path, detected?.id]);

  async function saveClip(clip, start, end, title, game, tags) {
    if (!window?.clipx?.saveClip) {
      console.error("window.clipx.saveClip is not available (preload not wired?)");
      return;
    }

    const saveId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const displayName = title?.trim() || getEditableClipName(clip?.name) || "Untitled Clip";
    onSaveQueueEvent?.({ type: "started", id: saveId, name: displayName, path: clip?.path });

    try {
      const response = await window.clipx.saveClip({clip, start, end, title, game, tags, mix, screen});
      if (response === 200){
        const renameResponse = await window.clipx.renameClip(clip?.path, "[ORIGINAL] " + displayName);
        if (renameResponse?.path) {
          onRenamed?.(clip.path, renameResponse);
        } else {
          console.error("Failed to rename clip after saving:", renameResponse);
        }
        onSaveQueueEvent?.({ type: "success", id: saveId });
        return;
      }
      onSaveQueueEvent?.({ type: "failed", id: saveId, error: response?.error || "Something went wrong saving this clip. Please try again." });
    } catch (err) {
      console.error("Failed to save clip:", err);
      const message = String(err?.message || "")
        .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "")
        .trim();
      onSaveQueueEvent?.({ type: "failed", id: saveId, error: message || "Something went wrong saving this clip. Please try again." });
    }
  }

  async function saveClipRecord(clipData) {
    if (!userId) {
      return { data: null, error: new Error("No authenticated user found") };
    }

    return supabase.rpc('create_clip_with_tags', {
      title: clipData.title,
      visibility: clipData.visibility,
      game_id: clipData.game?.id ?? null,
      blob_name: clipData.blobName || "",
      thumbnail_blob_name: clipData.thumbnailBlobName || "",
      youtube_video_id: clipData.youtubeID || "",
      user_ids: clipData.tags.filter((tag) => tag?.id).map((tag) => tag.id),
      labels: clipData.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()),
    });
  }

  async function uploadClip(clip, start, end, title, game, tags) {
    if (!window?.clipx?.uploadClip) {
      console.error("window.clipx.uploadClip is not available (preload not wired?)");
      return;
    }

    const uploadId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const displayName = title?.trim() || getEditableClipName(clip?.name) || "Untitled Clip";
    onUploadQueueEvent?.({ type: "started", id: uploadId, name: displayName, path: clip?.path });

    try {
      const tagsError = getClipTagsError(tags);
      if (tagsError) {
        onUploadQueueEvent?.({ type: "failed", id: uploadId, error: tagsError });
        return;
      }

      const response = await window.clipx.uploadClip({ clip, start, end, title: displayName, game, tags, userId, mix, screen });
      if (response?.status === 200) {
        const { data: clipId, error } = await saveClipRecord({
          id: uploadId,
          name: displayName,
          game: game,
          tags: tags,
          clip: clip,
          title: displayName,
          youtubeID: response.videoId,
          blobName: response.blobName,
          thumbnailBlobName: response.thumbnailBlobName,
          visibility: visibility,
          userId,
        });
        
        if (error) {
          console.error("Failed to save clip record to database:", error);
          try {
            await window.clipx.deleteClipBlob({
              blobName: response.blobName,
              thumbnailBlobName: response.thumbnailBlobName,
            });
          } catch (cleanupError) {
            console.error("Failed to clean up uploaded blobs after persistence failure:", cleanupError);
          }
          onUploadQueueEvent?.({ type: "failed", id: uploadId, error: `Upload succeeded but could not be saved to your library: ${error.message || "Please try again."}` });
          return;
        }

        onUploadQueueEvent?.({
          type: "success",
          id: uploadId,
          shareUrl: visibility === "public" && clipId ? getClipShareUrl(clipId) : null,
        });
        return;
      }

      onUploadQueueEvent?.({ type: "failed", id: uploadId, error: response?.error || "Upload failed." });
    } catch (err) {
      console.error("Failed to upload clip:", err);
      const message = String(err?.message || "")
        .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "")
        .trim();
      onUploadQueueEvent?.({ type: "failed", id: uploadId, error: message || "Upload failed." });
    }
  }

  return (
    <div className="upload-menu">
      <div className="upload-menu-header">
        <p className="eyebrow">Publish</p>
        <h4>Upload Details</h4>
        {target && (
          <span className="upload-menu-target" title="Save and Upload use this screen">
            <ScreenIcon view={target} />
            {target.label}
          </span>
        )}
      </div>
      <ClipDetailsFields
        title={clipTitle}
        onTitleChange={setClipTitle}
        game={game}
        onGameChange={setGame}
        tags={tags}
        onTagsChange={setTags}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        friendsOptions={friendsOptions}
      />
      <div className="upload-menu-actions">
          {session && (
            <Button
              variant={"contained"}
              onClick={() => {uploadClip(clip, start, end, clipTitle, game, tags)}}
              disabled={uploading || saving || emptyRange}
            >
            Upload
          </Button>)}
        <Button variant={session ? "outlined" : "contained"} onClick={() => {saveClip(clip, start, end, clipTitle, game, tags)}} disabled={uploading || saving || emptyRange} >Save</Button>
        <Button
          variant={"contained"}
          color={"error"}
          endIcon={screens ? <ArrowDropDownIcon /> : undefined}
          onClick={(e) => (screens ? setDeleteAnchor(e.currentTarget) : onDelete(null))}
          disabled={uploading || saving}
        >
          Delete
        </Button>
      </div>
      {emptyRange && <p className="upload-menu-note">This screen has no video in the trimmed part. Move the trim later or pick another screen.</p>}
      {screens && (
        <Menu anchorEl={deleteAnchor} open={Boolean(deleteAnchor)} onClose={() => setDeleteAnchor(null)}>
          {screens.map((view) => (
            <MenuItem
              key={view.path}
              className="delete-menu-item"
              disabled={view.path === clip.path}
              onClick={() => {
                setDeleteAnchor(null);
                onDelete(view);
              }}
            >
              <ScreenIcon view={view} />
              Delete {view.label.toLowerCase()}
              {view.path === clip.path && <span className="delete-menu-note">Holds the audio</span>}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem
            className="delete-menu-item delete-menu-item--all"
            onClick={() => {
              setDeleteAnchor(null);
              onDelete(target, { screen });
            }}
          >
            <CenterFocusStrongIcon fontSize="small" />
            Keep only {target.label.toLowerCase()}
          </MenuItem>
          <MenuItem
            className="delete-menu-item delete-menu-item--all"
            onClick={() => {
              setDeleteAnchor(null);
              onDelete(null);
            }}
          >
            <DeleteSweepIcon fontSize="small" />
            Delete all screens
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}
