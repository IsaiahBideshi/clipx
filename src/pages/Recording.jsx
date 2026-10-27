import './settings.css';
import './recording.css';

import { useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import { getOptions } from "./Settings.jsx";
import { toAccelerator } from "../lib/hotkeys.js";
import { getClippingStatusLabel, useClippingState } from "../lib/clippingState.js";
import {
  MAX_AUDIO_TRACKS,
  MAX_CLIP_SECONDS,
  MIN_CLIP_SECONDS,
  QUALITY_FPS,
  QUALITY_HEIGHTS,
  clampClipSeconds,
  describeRecorders,
  estimateLoad,
  getEnabledScreens,
  getRecordingOptions,
  planRecorders,
} from "../../electron/utils/recordingPlan.js";

const MAP_MAX_HEIGHT = 170;
const STATUS_TONES = { ready: "on", error: "error", installing: "busy", starting: "busy" };

function formatHeight(height) {
  return height === 2160 ? "4K" : `${height}p`;
}

function getTrackLabel(track) {
  if (track.kind === "mic") return "Microphone";
  if (track.kind === "game") return "Game";
  return track.name || String(track.exe).replace(/\.exe$/i, "");
}

function getTrackDetail(track) {
  if (track.kind === "mic") return "Default microphone";
  if (track.kind === "game") return "Follows the detected game";
  return track.exe;
}

function toGameOption(game) {
  const imageId = game?.cover?.image_id;
  return {
    id: game.id,
    name: game.name,
    label: game.name + (game.first_release_date ? ` (${new Date(game.first_release_date * 1000).getFullYear()})` : ""),
    image: imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : null,
  };
}

function GameSearch({ value = null, autoFocus = false, onChange, onBlur }) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (input.trim().length < 3 || typeof window.clipx?.searchGames !== "function") {
      setOptions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const games = await window.clipx.searchGames(input.trim()).catch(() => []);
      if (!cancelled) {
        setOptions((games || []).map(toGameOption));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  return (
    <Autocomplete
      className="detected-game-search"
      size="small"
      options={options}
      value={value}
      filterOptions={(gameList) => gameList}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      onInputChange={(_event, nextInput) => setInput(nextInput)}
      onChange={(_event, game) => onChange(game)}
      onBlur={onBlur}
      renderInput={(params) => <TextField {...params} autoFocus={autoFocus} label="Search games" />}
    />
  );
}

function ScreenMap({ screens, getRole, canPickPrimary, onToggle, onPick }) {
  const minX = Math.min(...screens.map((screen) => screen.x));
  const minY = Math.min(...screens.map((screen) => screen.y));
  const totalWidth = Math.max(...screens.map((screen) => screen.x + screen.width)) - minX;
  const totalHeight = Math.max(...screens.map((screen) => screen.y + screen.height)) - minY;

  return (
    <div
      className="screen-map"
      style={{ aspectRatio: `${totalWidth} / ${totalHeight}`, maxWidth: `${(MAP_MAX_HEIGHT * totalWidth) / totalHeight}px` }}
    >
      {screens.map((screen) => {
        const role = getRole(screen);
        const pickable = canPickPrimary && role !== "Off";
        return (
          <div
            key={screen.id}
            className="screen-slot"
            style={{
              left: `${((screen.x - minX) / totalWidth) * 100}%`,
              top: `${((screen.y - minY) / totalHeight) * 100}%`,
              width: `${(screen.width / totalWidth) * 100}%`,
              height: `${(screen.height / totalHeight) * 100}%`,
            }}
          >
            <div
              className={`screen-tile screen-tile--${role === "Off" ? "off" : role.startsWith("Primary") ? "primary" : "secondary"} ${pickable ? "screen-tile--pickable" : ""}`}
              role={pickable ? "button" : undefined}
              tabIndex={pickable ? 0 : undefined}
              title={`${screen.label || `Screen ${screen.number}`} · ${screen.width} × ${screen.height}`}
              onClick={() => pickable && onPick(screen)}
              onKeyDown={(event) => {
                if (pickable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onPick(screen);
                }
              }}
            >
              <span className="screen-number">{screen.number}</span>
              <span className="screen-size">{screen.width} × {screen.height}</span>
              <span className="screen-role">{role}</span>
              <label className="screen-record" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  size="small"
                  checked={role !== "Off"}
                  onChange={(event) => onToggle(screen, event.target.checked)}
                />
                Record
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Recording() {
  const [options, setOptions] = useState();
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [audioApps, setAudioApps] = useState(null);
  const [selectedApp, setSelectedApp] = useState("");
  const [changingGame, setChangingGame] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [runningApps, setRunningApps] = useState(null);
  const [assignExe, setAssignExe] = useState("");
  const [assignGame, setAssignGame] = useState(null);
  const [clipSecondsDraft, setClipSecondsDraft] = useState(null);
  const loadedRef = useRef(false);
  const clippingState = useClippingState();

  const recording = getRecordingOptions(options);
  const screens = clippingState?.screens || [];
  const plan = planRecorders(screens, options);
  const enabledIds = new Set(getEnabledScreens(screens, recording.clipDisabledScreens).map((screen) => screen.id));
  const follows = plan[0]?.screenId === null;
  const isRecording = clippingState?.status === "ready";
  const tracks = recording.clipAudioTracks;
  const multipleScreens = screens.length > 1;
  const detected = clippingState?.game || null;

  function commitClipSeconds(value) {
    setClipSecondsDraft(null);
    if (String(value).trim() === "") {
      return;
    }

    const seconds = clampClipSeconds(value);
    if (seconds !== recording.clipSeconds) {
      updateOption("clipSeconds", seconds);
    }
  }

  function updateOption(key, value) {
    setOptions((previous) => ({ ...(previous || {}), [key]: value }));
  }

  useEffect(() => {
    let cancelled = false;
    getOptions().then((loadedOptions) => {
      if (!cancelled) {
        setOptions(loadedOptions || {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!options) {
      return;
    }
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }

    window.clipx?.saveOptions?.(options).catch((err) => {
      console.error("Failed to save options:", err);
    });
  }, [options]);

  useEffect(() => {
    if (!isRecording || typeof window.clipx?.listAudioApps !== "function") {
      setAudioApps(null);
      return;
    }
    refreshAudioApps();
  }, [isRecording, clippingState?.recorderCount]);

  useEffect(() => {
    window.clipx?.listGameAssignments?.()
      .then(setAssignments)
      .catch((err) => console.error("Failed to load game assignments:", err));
  }, []);

  function loadRunningApps() {
    window.clipx?.listRunningApps?.()
      .then(setRunningApps)
      .catch((err) => {
        console.error("Failed to list running apps:", err);
        setRunningApps([]);
      });
  }

  async function assignSelectedGame() {
    const updated = await window.clipx.assignGame(assignExe, { id: assignGame.id, name: assignGame.name, image: assignGame.image })
      .catch((err) => {
        console.error("Failed to assign the game:", err);
        return null;
      });
    if (updated) {
      setAssignments(updated);
      setAssignExe("");
      setAssignGame(null);
    }
  }

  async function removeAssignment(exe) {
    const updated = await window.clipx.removeGameAssignment(exe).catch((err) => {
      console.error("Failed to remove the game assignment:", err);
      return null;
    });
    if (updated) {
      setAssignments(updated);
    }
  }

  function refreshAudioApps() {
    window.clipx.listAudioApps()
      .then((apps) => setAudioApps(apps))
      .catch((err) => {
        console.error("Failed to list audio apps:", err);
        setAudioApps(null);
      });
  }

  function getRole(screen) {
    if (!enabledIds.has(screen.id)) return "Off";
    if (!follows) return plan[0]?.screenId === screen.id ? "Primary" : "Secondary";
    if (!isRecording) return "Auto";
    return clippingState.primaryScreenId === screen.id ? "Primary now" : "Secondary";
  }

  function toggleScreen(screen, enabled) {
    const disabled = recording.clipDisabledScreens.map(String).filter((id) => id !== String(screen.id));
    updateOption("clipDisabledScreens", enabled ? disabled : [...disabled, String(screen.id)]);
  }

  function handleHotkeyKeyDown(event) {
    if (!capturingHotkey) {
      return;
    }

    event.preventDefault();
    if (event.key === "Escape") {
      setCapturingHotkey(false);
      return;
    }

    const accelerator = toAccelerator(event);
    if (accelerator) {
      updateOption("clipHotkey", accelerator);
      setCapturingHotkey(false);
    }
  }

  function addTrack(track) {
    if (tracks.length >= MAX_AUDIO_TRACKS) {
      return;
    }
    updateOption("clipAudioTracks", [...tracks, { id: crypto.randomUUID(), volume: 100, ...track }]);
  }

  function updateTrack(id, patch) {
    updateOption("clipAudioTracks", tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }

  function removeTrack(id) {
    updateOption("clipAudioTracks", tracks.filter((track) => track.id !== id));
  }

  async function pickGame(game) {
    if (!game?.id || typeof window.clipx?.setDetectedGame !== "function") {
      return;
    }
    await window.clipx.setDetectedGame({ id: game.id, name: game.name, image: game.image }).catch((err) => {
      console.error("Failed to set the detected game:", err);
    });
    setChangingGame(false);
  }

  if (!options) {
    return (
      <div className="settings-container settings-page">
        <div className="state-loader"><CircularProgress /></div>
      </div>
    );
  }

  const hasMic = tracks.some((track) => track.kind === "mic");
  const hasGame = tracks.some((track) => track.kind === "game");
  const tracksFull = tracks.length >= MAX_AUDIO_TRACKS;
  const availableApps = (audioApps || []).filter((app) => !tracks.some((track) => track.exe?.toLowerCase() === app.exe.toLowerCase()));

  return (
    <div className="settings-container settings-page recording-page">
      <div className="settings-hero">
        <div>
          <p className="eyebrow">Capture</p>
          <h2>Recording</h2>
          <span className={`recording-status recording-status--${STATUS_TONES[clippingState?.status] || "off"}`} role="status">
            {(clippingState?.status === "installing" || clippingState?.status === "starting") && <CircularProgress size={12} color="inherit" />}
            {getClippingStatusLabel(clippingState)}
          </span>
        </div>
        <div className="recording-hero-controls">
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(options.clippingEnabled)}
                disabled={!options.clipsFolder}
                onChange={(event) => updateOption("clippingEnabled", event.target.checked)}
              />
            }
            label="Clipping on"
          />
          <Button
            variant="outlined"
            data-disable-global-hotkeys
            onClick={() => setCapturingHotkey(true)}
            onKeyDown={handleHotkeyKeyDown}
            onBlur={() => setCapturingHotkey(false)}
          >
            {capturingHotkey ? "Press a hotkey..." : `Hotkey: ${recording.clipHotkey}`}
          </Button>
          <TextField
            size="small"
            type="number"
            label={`Clip length (${MIN_CLIP_SECONDS}-${MAX_CLIP_SECONDS}s)`}
            value={clipSecondsDraft ?? recording.clipSeconds}
            onChange={(event) => setClipSecondsDraft(event.target.value)}
            onBlur={(event) => commitClipSeconds(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.target.blur();
              }
            }}
            slotProps={{ htmlInput: { min: MIN_CLIP_SECONDS, max: MAX_CLIP_SECONDS, step: 1 } }}
            sx={{ width: 180 }}
          />
        </div>
      </div>

      {!options.clipsFolder && (
        <p className="card-copy recording-warning">Choose a clips folder in Settings to turn on clipping.</p>
      )}
      {clippingState?.hotkeyError && (
        <p className="card-copy recording-warning">{clippingState.hotkeyError}</p>
      )}

      <div className="settings-grid">
        <section className="settings-card recording-card--wide">
          <div className="recording-card-header">
            <h4>Screens</h4>
            <Button size="small" startIcon={<VisibilityOutlinedIcon fontSize="small" />} onClick={() => window.clipx?.identifyScreens?.()}>
              Identify screens
            </Button>
          </div>
          {multipleScreens && (
            <div className="recording-row">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={recording.clipAutoSwitch}
                    onChange={(event) => updateOption("clipAutoSwitch", event.target.checked)}
                  />
                }
                label="Switch primary screen automatically"
              />
              <FormControl size="small" disabled={!recording.clipAutoSwitch}>
                <Select value={recording.clipFollow} onChange={(event) => updateOption("clipFollow", event.target.value)}>
                  <MenuItem value="mouse">Follow your mouse</MenuItem>
                  <MenuItem value="focus">Follow the focused app</MenuItem>
                </Select>
              </FormControl>
            </div>
          )}
          {screens.length > 0 && (
            <ScreenMap
              screens={screens}
              getRole={getRole}
              canPickPrimary={multipleScreens && !recording.clipAutoSwitch}
              onToggle={toggleScreen}
              onPick={(screen) => updateOption("clipPrimaryScreen", screen.id)}
            />
          )}
        </section>

        <section className="settings-card recording-card--wide">
          <h4>Quality</h4>
          <div className="quality-row">
            <span>{multipleScreens ? "Primary screen" : "Screen"}</span>
            <Select size="small" value={recording.clipPrimaryHeight} onChange={(event) => updateOption("clipPrimaryHeight", event.target.value)}>
              {QUALITY_HEIGHTS.map((height) => <MenuItem key={height} value={height}>{formatHeight(height)}</MenuItem>)}
            </Select>
            <Select size="small" value={recording.clipPrimaryFps} onChange={(event) => updateOption("clipPrimaryFps", event.target.value)}>
              {QUALITY_FPS.map((fps) => <MenuItem key={fps} value={fps}>{fps} fps</MenuItem>)}
            </Select>
          </div>
          {multipleScreens && (
            <div className="quality-row">
              <span>Secondary screens</span>
              <Select size="small" value={recording.clipSecondaryHeight} onChange={(event) => updateOption("clipSecondaryHeight", event.target.value)}>
                {QUALITY_HEIGHTS.map((height) => <MenuItem key={height} value={height}>{formatHeight(height)}</MenuItem>)}
              </Select>
              <Select size="small" value={recording.clipSecondaryFps} onChange={(event) => updateOption("clipSecondaryFps", event.target.value)}>
                {QUALITY_FPS.map((fps) => <MenuItem key={fps} value={fps}>{fps} fps</MenuItem>)}
              </Select>
            </div>
          )}
          <p className="card-copy">
            {plan.length
              ? `Estimated load: ${estimateLoad(plan)} · ${describeRecorders(plan)}`
              : "Turn on at least one screen to record."}
          </p>
        </section>

        <section className="settings-card recording-card--wide">
          <div className="recording-card-header">
            <h4>Audio tracks</h4>
            <span className="card-copy">{tracks.length} of {MAX_AUDIO_TRACKS} extra tracks used</span>
          </div>
          <div className="audio-track audio-track--fixed">
            <span className="audio-track-index">1</span>
            <div>
              <p className="audio-track-name">Full mix</p>
              <p className="audio-track-detail">Everything you hear{hasMic ? " plus your microphone" : ""}. Used for playback and sharing.</p>
            </div>
            <span className="audio-track-detail">Always on</span>
          </div>
          {tracks.map((track, index) => (
            <div className="audio-track" key={track.id || index}>
              <span className="audio-track-index">{index + 2}</span>
              <div>
                <p className="audio-track-name">{getTrackLabel(track)}</p>
                <p className="audio-track-detail">{getTrackDetail(track)}</p>
              </div>
              <Slider
                size="small"
                aria-label={`${getTrackLabel(track)} volume`}
                defaultValue={track.volume ?? 100}
                onChangeCommitted={(_event, value) => updateTrack(track.id, { volume: value })}
              />
              <IconButton size="small" aria-label={`Remove ${getTrackLabel(track)} track`} onClick={() => removeTrack(track.id)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </div>
          ))}
          <div className="recording-row">
            <Button size="small" variant="outlined" disabled={hasMic || tracksFull} onClick={() => addTrack({ kind: "mic" })}>
              Add microphone
            </Button>
            <Button size="small" variant="outlined" disabled={hasGame || tracksFull} onClick={() => addTrack({ kind: "game" })}>
              Add game
            </Button>
            {audioApps ? (
              <>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel id="audio-app-label">App</InputLabel>
                  <Select labelId="audio-app-label" label="App" value={selectedApp} onChange={(event) => setSelectedApp(event.target.value)}>
                    {availableApps.map((app) => (
                      <MenuItem key={app.exe} value={app.exe}>{app.exe} · {app.title}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!selectedApp || tracksFull}
                  onClick={() => {
                    addTrack({ kind: "app", exe: selectedApp });
                    setSelectedApp("");
                  }}
                >
                  Add app track
                </Button>
                <IconButton size="small" aria-label="Refresh app list" onClick={refreshAudioApps}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </>
            ) : (
              <span className="card-copy">Turn on clipping to add tracks for apps like Discord or Spotify.</span>
            )}
          </div>
        </section>

        <section className="settings-card recording-card--wide">
          <h4>Game detection</h4>
          <div className="recording-row">
            <FormControlLabel
              control={
                <Checkbox
                  checked={recording.clipDetectGame}
                  onChange={(event) => updateOption("clipDetectGame", event.target.checked)}
                />
              }
              label="Tag clips with the game you're playing"
            />
          </div>
          {recording.clipDetectGame && (
            detected ? (
              <div className="recording-row detected-game">
                {detected.game?.image && <img src={detected.game.image} alt="" className="detected-game-cover" />}
                <div>
                  <p className="audio-track-name">{detected.game?.name || detected.name}</p>
                  <p className="audio-track-detail">
                    {detected.exe} · {detected.game?.id ? "matched on IGDB" : "not matched yet. Sign in to match it, or pick it below."}
                  </p>
                </div>
                {!changingGame && (
                  <Button size="small" onClick={() => setChangingGame(true)}>Change</Button>
                )}
                {changingGame && (
                  <GameSearch autoFocus onChange={pickGame} onBlur={() => setChangingGame(false)} />
                )}
              </div>
            ) : (
              <p className="card-copy">No game detected yet.</p>
            )
          )}
          {recording.clipDetectGame && (
            <>
              <p className="audio-track-name game-assignments-title">Assigned apps</p>
              {assignments.map((assignment) => (
                <div className="game-assignment" key={assignment.exe}>
                  <div>
                    <p className="audio-track-name">{assignment.game?.name}</p>
                    <p className="audio-track-detail">{assignment.exe}</p>
                  </div>
                  <IconButton size="small" aria-label={`Remove ${assignment.exe}`} onClick={() => removeAssignment(assignment.exe)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </div>
              ))}
              <div className="recording-row">
                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel id="assign-app-label">Running app</InputLabel>
                  <Select
                    labelId="assign-app-label"
                    label="Running app"
                    value={assignExe}
                    onOpen={loadRunningApps}
                    onChange={(event) => setAssignExe(event.target.value)}
                  >
                    {runningApps === null && <MenuItem disabled value="">Loading...</MenuItem>}
                    {(runningApps || []).map((runningApp) => (
                      <MenuItem key={runningApp.exe} value={runningApp.exe}>{runningApp.exe} · {runningApp.title}</MenuItem>
                    ))}
                    {assignExe && !runningApps?.some((runningApp) => runningApp.exe === assignExe) && (
                      <MenuItem value={assignExe}>{assignExe}</MenuItem>
                    )}
                  </Select>
                </FormControl>
                <GameSearch value={assignGame} onChange={setAssignGame} />
                <Button size="small" variant="outlined" disabled={!assignExe || !assignGame?.id} onClick={assignSelectedGame}>
                  Assign
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <p className="card-copy recording-credit">Recording powered by OBS Studio (GPLv2).</p>
    </div>
  );
}
