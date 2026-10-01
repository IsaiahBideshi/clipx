import { createRoot } from "react-dom/client";
import VideoPlayer from "./components/VideoPlayer.jsx";
import { usePlayerPrefs } from "./lib/playerPrefs.js";

function SharePlayer({ src }) {
  const { volume, muted, setVolume, setMuted } = usePlayerPrefs();

  return (
    <VideoPlayer
      className="video-player-shell-fill"
      src={src}
      volume={volume}
      muted={muted}
      onVolumeChange={({ volume: v, muted: m }) => {
        setVolume(v);
        setMuted(m);
      }}
    />
  );
}

const container = document.getElementById("clip-player");
createRoot(container).render(<SharePlayer src={container.dataset.src} />);
