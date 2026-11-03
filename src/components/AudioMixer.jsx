import { useState } from "react";
import { IconButton, Slider } from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";

const DEFAULT_LEVEL = { volume: 100, muted: false };

function getTrackLabel(track) {
  return String(track.name || "").replace(/\.exe$/i, "");
}

export default function AudioMixer({ tracks, levels, onChange }) {
  const [open, setOpen] = useState(false);
  const changed = tracks.some((track) => levels[track.index]?.muted || (levels[track.index]?.volume ?? 100) !== 100);

  function updateLevel(index, patch) {
    onChange((current) => ({ ...current, [index]: { ...DEFAULT_LEVEL, ...current[index], ...patch } }));
  }

  return (
    <div className="audio-mixer" data-disable-global-hotkeys>
      <div className="audio-mixer-header">
        <button type="button" className="audio-mixer-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <GraphicEqIcon fontSize="small" />
          <span>Audio tracks</span>
          {changed && <span className="audio-mixer-badge">Custom mix</span>}
          <ExpandMoreIcon fontSize="small" className={`audio-mixer-chevron ${open ? "audio-mixer-chevron--open" : ""}`} />
        </button>
        {changed && (
          <button type="button" className="audio-mixer-reset" onClick={() => onChange({})}>
            Reset
          </button>
        )}
      </div>

      {open && (
        <div className="audio-mixer-tracks">
          {tracks.map((track) => {
            const level = { ...DEFAULT_LEVEL, ...levels[track.index] };
            const label = getTrackLabel(track);
            return (
              <div className="audio-mixer-track" key={track.index}>
                <IconButton
                  size="small"
                  aria-label={level.muted ? `Unmute ${label}` : `Mute ${label}`}
                  onClick={() => updateLevel(track.index, { muted: !level.muted })}
                >
                  {level.muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                </IconButton>
                <span className="audio-mixer-name" title={label}>{label}</span>
                <Slider
                  size="small"
                  min={0}
                  max={200}
                  step={5}
                  value={level.volume}
                  disabled={level.muted}
                  aria-label={`${label} volume`}
                  onChange={(_event, value) => updateLevel(track.index, { volume: value })}
                  onPointerUp={() => document.activeElement?.blur()}
                />
                <span className="audio-mixer-value">{level.muted ? "Muted" : `${level.volume}%`}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
