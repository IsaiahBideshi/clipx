import fallBackThumb from "../assets/thumbnail.svg";
import { useState, useEffect } from "react";

import MoreVertIcon from '@mui/icons-material/MoreVert';
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import { getScreenCount } from "../../electron/utils/clipManifest.js";

function ClipCard({ clip, baseFolder, onClick, onContextMenuAction }) {
  const [thumbSrc, setThumbSrc] = useState(() => getThumbUrl(clip.thumbnailPath) || fallBackThumb);
  const [hasThumb, setHasThumb] = useState(Boolean(clip.thumbnailPath));
  const [screenCount, setScreenCount] = useState(1);
  const [groupVersion, setGroupVersion] = useState(0);

  useEffect(() => {
    if (!clip.groupPath) {
      setScreenCount(1);
      return undefined;
    }

    let mounted = true;
    window.clipx?.getClipGroup?.(clip.path)
      .then((group) => {
        if (mounted) {
          setScreenCount(group ? getScreenCount(group.files) : 1);
        }
      })
      .catch((error) => console.error("Failed to load the clip's screens:", error));

    return () => {
      mounted = false;
    };
  }, [clip.path, clip.groupPath, clip.modifiedAt, groupVersion]);

  useEffect(() => {
    if (screenCount < 2 || typeof window.clipx?.onLocalClipIndexChanged !== "function") {
      return undefined;
    }

    return window.clipx.onLocalClipIndexChanged((event) => {
      if (event?.type === "removed" && event.clip?.groupPath === clip.groupPath) {
        setGroupVersion((version) => version + 1);
      }
    });
  }, [screenCount, clip.groupPath]);

  function getURL() {
    return `clipx://video?path=${encodeURIComponent(clip.path)}`;
  }

  useEffect(() => {
    let mounted = true;

    const cachedThumbUrl = getThumbUrl(clip.thumbnailPath);
    if (cachedThumbUrl) {
      setThumbSrc(cachedThumbUrl);
      setHasThumb(true);
      return () => {
        mounted = false;
      };
    }

    setThumbSrc(fallBackThumb);
    setHasThumb(false);

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
          setHasThumb(true);
        }
      })
      .catch((error) => {
        console.error("Failed to load thumbnail:", error);
      });

    return () => {
      mounted = false;
    };
  }, [baseFolder, clip.path, clip.thumbnailPath]);
  return (
    <div className={`clip-card ${hasThumb ? "" : "no-thumb"} ${screenCount > 1 ? "clip-card--stacked" : ""}`} onClick={onClick} onContextMenu={(e) => {
      e.preventDefault();
      onContextMenuAction(clip, { x: e.clientX, y: e.clientY });
    }}>
        {hasThumb ? (
          <img src={thumbSrc} className="clip-thumb" />
        ) : (
          <div className="thumb-placeholder" />
        )}
        {screenCount > 1 && (
          <span className="clip-screens-badge" title={`${screenCount} screens`}>
            <DesktopWindowsIcon sx={{ fontSize: 14 }} />
            {screenCount}
          </span>
        )}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", justifyContent: "space-between", width: "100%", alignItems: "center", gap: "8px" }}>
        <div>
          <div className="clip-name" title={clip.name}>{clip.name}</div>
          <div className={"clip-date"}>{formatDate(clip.createdAt)}</div>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <MoreVertIcon className="clip-options-icon" style={{ flexShrink: 0 }} onClick={(e) => {
            e.stopPropagation();
            onContextMenuAction(clip, { x: e.clientX, y: e.clientY });
          }} />
        </div>
      </div>
    </div>
  );
}

export default ClipCard;

function getThumbUrl(thumbPath) {
  return thumbPath ? `clipx://image?path=${encodeURIComponent(thumbPath)}` : null;
}

export function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000); // in seconds

  if (diff < 60) {
    return `${diff} seconds ago`;
  }
  if (diff < 3600) {
    const time = Math.floor(diff / 60);
    return `${time} minute${time !== 1 ? "s" : ""} ago`;
  }
  if (diff < 86400) {
    const time = Math.floor(diff / 3600);
    return `${time} hour${time !== 1 ? "s" : ""} ago`;
  }
  if (diff < 604800) {
    const time = Math.floor(diff / 86400);
    return `${time} day${time !== 1 ? "s" : ""} ago`;
  }
  if (diff < 2419200) {
    const time = Math.floor(diff / 604800);
    return `${time} week${time !== 1 ? "s" : ""} ago`;
  }
  if (diff < 29030400) {
    const time = Math.floor(diff / 2419200);
    return `${time} month${time !== 1 ? "s" : ""} ago`;
  }
  const time = Math.floor(diff / 29030400);
  return `${time} year${time !== 1 ? "s" : ""} ago`;
}
