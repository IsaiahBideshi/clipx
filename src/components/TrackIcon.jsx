import { useEffect, useState } from "react";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import MicIcon from "@mui/icons-material/Mic";

export default function TrackIcon({ kind, exe, gameImage }) {
  const [appIcon, setAppIcon] = useState(null);

  useEffect(() => {
    setAppIcon(null);
    if (kind !== "app" || !exe || typeof window.clipx?.getAppIcon !== "function") {
      return undefined;
    }

    let cancelled = false;
    window.clipx.getAppIcon(exe)
      .then((icon) => {
        if (!cancelled) {
          setAppIcon(icon);
        }
      })
      .catch((err) => console.error("Failed to load the app icon:", err));
    return () => {
      cancelled = true;
    };
  }, [kind, exe]);

  if (kind === "mic") {
    return <MicIcon className="track-icon" fontSize="small" />;
  }

  const image = kind === "game" ? gameImage : appIcon;
  if (image) {
    return <img className={`track-icon track-icon--${kind}`} src={image} alt="" />;
  }
  return <GraphicEqIcon className="track-icon" fontSize="small" />;
}
