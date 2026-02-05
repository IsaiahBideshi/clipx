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
    </div>
  );
}

export default ClipCard;
