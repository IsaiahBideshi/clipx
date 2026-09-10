import { useEffect, useImperativeHandle, useRef, useState } from "react";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeDownIcon from "@mui/icons-material/VolumeDown";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { isTextEntryActive } from "../lib/hotkeys.js";
import "./player.css";

const IDLE_HIDE_MS = 1200;

function formatTime(timeInSeconds) {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) return "0:00";
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VideoPlayer({
  ref,
  src,
  poster,
  volume = 1,
  muted = false,
  startTime = 0,
  endTime = Infinity,
  showSkipButtons = false,
  className,
  onNextClip,
  onPrevClip,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onVolumeChange,
  onKeyDown,
  autoPlay = true
}) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const idleTimerRef = useRef(null);
  const callbacksRef = useRef({});
  const autoplayedRef = useRef(false);
  const stateRef = useRef({});

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMouseIdle, setIsMouseIdle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasDimensions, setHasDimensions] = useState(false);

  const start = Math.max(0, startTime);
  const end = Number.isFinite(endTime) ? endTime : duration;

  const durationSafe = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const currentSafe = Math.min(Math.max(currentTime || 0, 0), durationSafe || 0);
  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const miniProgressPct = end > start
    ? ((currentSafe - start) / (end - start)) * 100
    : 0;
  const shouldUseIdleUi = isFullscreen && isMouseIdle;

  useEffect(() => {
    callbacksRef.current = { onLoadedMetadata, onTimeUpdate, onPlay, onPause, onEnded, onVolumeChange, onKeyDown, onNextClip, onPrevClip };
  });

  useEffect(() => {
    stateRef.current = { start, end, volume, muted, duration, currentTime };
  });

  useEffect(() => {
    setLoading(true);
    setHasDimensions(false);
    autoplayedRef.current = false;
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || el.readyState < 2) return;
    if (el.currentTime < start || el.currentTime >= end) {
      el.currentTime = start;
      setCurrentTime(start);
      callbacksRef.current.onTimeUpdate?.(start);
    }
  }, [start]);

  function seek(time) {
    const el = videoRef.current;
    if (!el) return;
    const t = Math.max(0, Math.min(time, el.duration || 0));
    el.currentTime = t;
    setCurrentTime(t);
    callbacksRef.current.onTimeUpdate?.(t);
  }

  function play() {
    const el = videoRef.current;
    if (!el) return;
    const { start, end } = stateRef.current;

    if (el.currentTime < start || el.currentTime >= end) {
      el.currentTime = start;
      setCurrentTime(start);
      callbacksRef.current.onTimeUpdate?.(start);
    }

    el.play();
  }

  function pause() {
    videoRef.current?.pause();
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;

    if (el.paused || el.ended) {
      play();
    } else {
      el.pause();
    }
  }

  function toggleMute() {
    const { volume, muted } = stateRef.current;
    callbacksRef.current.onVolumeChange?.({
      volume: Number.isFinite(volume) ? volume : 1,
      muted: !muted,
    });
  }

  function handleVolumeChange(value) {
    const v = Math.max(0, Math.min(1, value));
    callbacksRef.current.onVolumeChange?.({ volume: v, muted: v === 0 });
  }

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;

    if (document.fullscreenElement === shell) {
      await document.exitFullscreen();
      return;
    }

    await shell.requestFullscreen();
  }

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

  useImperativeHandle(ref, () => ({
    play,
    pause,
    togglePlay,
    seek,
    get duration() {
      return duration;
    },
    get currentTime() {
      return currentTime;
    },
    get paused() {
      return videoRef.current ? videoRef.current.paused : true;
    },
  }), [duration, currentTime, start, end]);

  useEffect(() => {
    function onKeyDown(e) {
      const { start, end, volume, duration, currentTime } = stateRef.current;

      if (isTextEntryActive(e)) return;

      if (e.ctrlKey && e.key === "ArrowLeft") {
        e.preventDefault();
        callbacksRef.current.onPrevClip?.();
        return;
      }
      if (e.ctrlKey && e.key === "ArrowRight") {
        e.preventDefault();
        callbacksRef.current.onNextClip?.();
        return;
      }
      if (e.ctrlKey) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const percentage = e.key === "0" ? 0 : e.key / 10;
        seek(percentage * duration);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        handleVolumeChange(volume + 0.1);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleVolumeChange(volume - 0.1);
      }

      const seekStep = e.shiftKey ? 1 : 5;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(currentTime - seekStep, start));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(Math.min(currentTime + seekStep, end));
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }

      if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      }

      callbacksRef.current.onKeyDown?.(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);

    el.addEventListener("waiting", onWaiting);
    el.addEventListener("canplay", onCanPlay);

    el.volume = volume;
    el.muted = muted;

    return () => {
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("canplay", onCanPlay);
    };
  }, [volume, muted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    function handleVolumeChangeEvent() {
      callbacksRef.current.onVolumeChange?.({
        volume: el.volume,
        muted: !!el.muted,
      });
    }

    el.addEventListener("volumechange", handleVolumeChangeEvent);
    return () => el.removeEventListener("volumechange", handleVolumeChangeEvent);
  }, [muted]);

  return (
    <div
      className={`video-player-shell ${className || ""} ${hasDimensions ? "" : "video-player-shell-loading"}`.trim()}
      ref={shellRef}
      onMouseMove={handlePointerActivity}
      onMouseEnter={handlePointerActivity}
      onMouseDown={handlePointerActivity}
      onMouseLeave={scheduleIdle}
    >
      {loading && (
        <div className="video-loader">
          <div className="spinner"></div>
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        onLoadedMetadata={(e) => {
          const d = e.target.duration;
          setDuration(d);
          setHasDimensions(true);
          callbacksRef.current.onLoadedMetadata?.(d);
        }}
        onTimeUpdate={(e) => {
          const t = e.target.currentTime;
          const el = e.target;
          if (end > start && t >= end && !el.paused) {
            el.pause();
            el.currentTime = start;
            setCurrentTime(start);
            callbacksRef.current.onTimeUpdate?.(start);
            return;
          }
          setCurrentTime(t);
          callbacksRef.current.onTimeUpdate?.(t);
        }}
        onClick={togglePlay}
        onPlay={() => {
          setIsPlaying(true);
          autoplayedRef.current = true;
          callbacksRef.current.onPlay?.();
        }}
        onPause={() => {
          setIsPlaying(false);
          callbacksRef.current.onPause?.();
        }}
        onEnded={() => {
          setIsPlaying(false);
          callbacksRef.current.onEnded?.();
        }}
        onCanPlay={() => {
          setLoading(false);
          const el = videoRef.current;
          if (autoPlay && el && !autoplayedRef.current) {
            autoplayedRef.current = true;
            play();
          }
        }}
        onError={(e) => {
          console.error("VideoPlayer: Video playback error", e);
          setLoading(false);
        }}
        autoPlay={autoPlay}
        preload="auto"
        className="video-player-element"
        onDoubleClick={toggleFullscreen}
        poster={poster}
      />

      <div className={`video-player-controls ${shouldUseIdleUi ? "controls-hidden" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="video-progress-row">
          <span>{formatTime(currentTime - start)}</span>
          <input
            type="range"
            min={start}
            max={end}
            step={0.01}
            value={currentSafe}
            onChange={(e) => seek(Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
            aria-label="Seek"
            className="video-seek-slider"
          />
          <span>{formatTime(Math.max(0, end - start))}</span>
        </div>

        <div className="video-actions-row">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {showSkipButtons && (
              <button className="play-button" title="Previous (ctrl + ←)" type="button" onClick={onPrevClip} aria-label="Prev">
                <SkipPreviousIcon />
              </button>
            )}
            <button className="play-button" title={isPlaying ? "Pause (Spacebar)" : "Play (Spacebar)"} type="button" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </button>
            {showSkipButtons && (
              <button className="play-button" title="Next (ctrl + →)" type="button" onClick={onNextClip} aria-label="Next">
                <SkipNextIcon />
              </button>
            )}
          </div>

          <div className="video-volume-group">
            <button className="mute-button" title={muted ? "Unmute" : "Mute"} type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              {muted || volume === 0 ? (<VolumeOffIcon />) :
                volume < 0.5 ? (<VolumeDownIcon />) : (<VolumeUpIcon />)
              }
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(e) => handleVolumeChange(Number(e.target.value) / 100)}
              onPointerUp={(e) => e.currentTarget.blur()}
              aria-label="Volume"
              className="video-volume-slider"
            />

            <button className="play-button" title="Fullscreen (F)" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </button>
          </div>
        </div>
      </div>

      {shouldUseIdleUi && (
        <div className="video-mini-timeline-wrap" onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={start}
            max={end}
            step={0.01}
            value={currentSafe}
            onChange={(e) => seek(Number(e.target.value))}
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