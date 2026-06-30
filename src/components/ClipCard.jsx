import fallBackThumb from "../assets/thumbnail.png";
import { useState, useEffect } from "react";

function ClipCard({ clip, baseFolder, onClick }) {
  const [thumbSrc, setThumbSrc] = useState(() => getThumbUrl(clip.thumbnailPath) || fallBackThumb);
  const [hasThumb, setHasThumb] = useState(Boolean(clip.thumbnailPath));

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
    <div className={`clip-card ${hasThumb ? "" : "no-thumb"}`} onClick={onClick}>
      {hasThumb ? (
        <img src={thumbSrc} className="clip-thumb" />
      ) : (
        <div className="thumb-placeholder" />
      )}
      <div className="clip-name">{clip.name}</div>
      <div className={"clip-date"}>{formatDate(clip.createdAt)}</div>
    </div>
  );
}

export default ClipCard;

function getThumbUrl(thumbPath) {
  return thumbPath ? `clipx://image?path=${encodeURIComponent(thumbPath)}` : null;
}

function formatDate(dateStr) {
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
