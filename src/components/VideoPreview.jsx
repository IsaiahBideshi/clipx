import {useEffect, useRef, useState} from "react";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeDownIcon from "@mui/icons-material/VolumeDown";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";

function formatTime(timeInSeconds) {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) return "0:00";
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VideoPreview({
  videoRef,
  clip,
  onLoadedMetadata,
  onTimeUpdate,
  onTogglePlay,
  onSeek,
  isPlaying,
  currentTime,
  duration,
  startTime,
  endTime,
  volume,
  isMuted,
  onToggleMute,
  onSetVolume,
}) {
  const shellRef = useRef(null);
  const idleTimerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMouseIdle, setIsMouseIdle] = useState(false);

  const IDLE_HIDE_MS = 1200;

  const src = clip?.path
    ? `clipx://video?path=${encodeURIComponent(clip.path)}`
    : "";

  if (src === "") {
    console.error("VideoPreview: No clip path provided");
  }

  const durationSafe = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const currentSafe = Math.min(Math.max(currentTime || 0, 0), durationSafe || 0);
  const volumePercent = Math.round((isMuted ? 0 : volume) * 100);
  const miniProgressPct = endTime > startTime
    ? ((currentSafe - startTime) / (endTime - startTime)) * 100
    : 0;

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      setIsMouseIdle(false);
    }
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  function scheduleIdle() {
    if (!isFullscreen) return;

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      setIsMouseIdle(true);
    }, IDLE_HIDE_MS);
  }

  function handlePointerActivity() {
    if (!isFullscreen) {
      if (isMouseIdle) setIsMouseIdle(false);
      return;
    }

    if (isMouseIdle) {
      setIsMouseIdle(false);
    }
    scheduleIdle();
  }

  const shouldUseIdleUi = isFullscreen && isMouseIdle;

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;

    if (document.fullscreenElement === shell) {
      await document.exitFullscreen();
      return;
    }

    await shell.requestFullscreen();
  }

  return (
    <div
      className="video-preview-shell"
      ref={shellRef}
      onMouseMove={handlePointerActivity}
      onMouseEnter={handlePointerActivity}
      onMouseDown={handlePointerActivity}
      onMouseLeave={scheduleIdle}
    >
      <video
        ref={videoRef}
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onClick={onTogglePlay}
        className="video-preview-player"
      />

      <div className={`video-preview-controls ${shouldUseIdleUi ? "controls-hidden" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="video-progress-row">
          <span>{formatTime(currentTime-startTime)}</span>
          <input
            type="range"
            min={startTime}
            max={endTime}
            step={0.01}
            value={currentSafe}
            onChange={(e) => onSeek(Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
            aria-label="Seek"
            className="video-seek-slider"
          />
          <span>{formatTime(endTime-startTime)}</span>
        </div>

        <div className="video-actions-row">
          <button className={"play-button"} type="button" onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <PauseIcon/> : <PlayArrowIcon/>}
          </button>

          <div className="video-volume-group">
            <button className={"mute-button"} type="button" onClick={onToggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
              {isMuted || volume === 0 ? (<VolumeOffIcon/>) :
                volume < 0.5 ? (<VolumeDownIcon/>) : (<VolumeUpIcon/>)
              }
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(e) => onSetVolume(Number(e.target.value) / 100)}
              onPointerUp={(e) => e.currentTarget.blur()}
              aria-label="Volume"
              className="video-volume-slider"
            />

            <button className={"play-button"} type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
            </button>
          </div>
        </div>
      </div>

      {shouldUseIdleUi && (
        <div className="video-mini-timeline-wrap" onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={startTime}
            max={endTime}
            step={0.01}
            value={currentSafe}
            onChange={(e) => onSeek(Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
            aria-label="Seek timeline"
            className="video-mini-seek-slider"
            style={{ "--mini-progress": `${Math.max(0, Math.min(100, miniProgressPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
