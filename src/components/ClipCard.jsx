import fallBackThumb from "../assets/thumbnail.png";
import { useState, useEffect } from "react";

function ClipCard({ clip, baseFolder, onClick }) {
  const [thumbSrc, setThumbSrc] = useState(fallBackThumb);
  const [hasThumb, setHasThumb] = useState(false);

  function getURL() {
    return `clipx://video?path=${encodeURIComponent(clip.path)}`;
  }

  useEffect(() => {
    let mounted = true;

    window.clipx
      .getThumbnail(clip.path, baseFolder)
      .then((thumbPath) => {
        if (mounted) {
          setThumbSrc(`clipx://image?path=${thumbPath}`);
          setHasThumb(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [clip.path]);

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
