import { useEffect, useRef } from "react";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import { getSwipeDirection } from "../lib/screenLayout.js";

const SWIPE_MS = 320;
const SWIPE_TIMEOUT_MS = 2000;

export function ScreenIcon({ view }) {
  if (view.auto) {
    return <AutoModeIcon fontSize="small" />;
  }
  return view.windowsPrimary ? <DesktopWindowsIcon fontSize="small" /> : <DesktopWindowsOutlinedIcon fontSize="small" />;
}

export default function ScreenStage({ views, frontPath, playerRef, ratio, onSelect, children }) {
  const multi = views.length > 1;
  const snapshotRef = useRef(null);
  const cancelSwipeRef = useRef(null);

  useEffect(() => () => cancelSwipeRef.current?.(), []);

  function startSwipe(video, canvas, direction) {
    const options = { duration: SWIPE_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)" };
    const moved = direction.x !== 0 || direction.y !== 0;
    let timeout = 0;
    let animations = [];

    function hide() {
      canvas.style.visibility = "hidden";
    }

    function play() {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", play);
      animations = [
        canvas.animate(
          moved
            ? [{ transform: "none" }, { transform: `translate(${-direction.x * 100}%, ${-direction.y * 100}%)` }]
            : [{ opacity: 1 }, { opacity: 0 }],
          options
        ),
      ];
      if (moved) {
        animations.push(video.animate([{ transform: `translate(${direction.x * 100}%, ${direction.y * 100}%)` }, { transform: "none" }], options));
      }
      animations[0].onfinish = hide;
    }

    video.addEventListener("seeked", play);
    timeout = window.setTimeout(play, SWIPE_TIMEOUT_MS);
    cancelSwipeRef.current = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", play);
      animations.forEach((animation) => animation.cancel());
      hide();
    };
  }

  function select(view) {
    if (view.path === frontPath) {
      return;
    }

    cancelSwipeRef.current?.();
    const video = playerRef.current?.element;
    const canvas = snapshotRef.current;
    if (video?.readyState >= 2 && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      canvas.style.visibility = "visible";
      startSwipe(video, canvas, getSwipeDirection(views.find((item) => item.path === frontPath), view));
    }
    onSelect(view.path);
  }

  return (
    <>
      <div className={`screen-stage ${multi ? "screen-stage--multi" : ""}`} style={{ "--video-ratio": ratio }}>
        <div className="screen-stage-front">
          {children}
          {multi && <canvas ref={snapshotRef} className="screen-stage-snapshot" />}
        </div>
      </div>

      {multi && (
        <div className="screen-stage-chips" role="tablist" aria-label="Screens">
          {views.map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={view.path === frontPath}
              key={view.path}
              className={`screen-stage-chip ${view.path === frontPath ? "screen-stage-chip--active" : ""}`}
              onClick={() => select(view)}
            >
              <ScreenIcon view={view} />
              {view.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
