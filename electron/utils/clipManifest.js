export const CLIP_MANIFEST_NAME = "clip.json";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIME_SEPARATOR = "꞉";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toFileNamePart(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80);
}

export function getClipName(date, gameName) {
  const day = `${date.getFullYear()}-${MONTHS[date.getMonth()]}-${pad(date.getDate())}`;
  const hours = date.getHours();
  const time = [pad(hours % 12 || 12), pad(date.getMinutes()), pad(date.getSeconds())].join(TIME_SEPARATOR);
  const game = toFileNamePart(gameName);
  return `Clip ${day} ${game ? `[${game}] ` : ""}${time}${hours < 12 ? "AM" : "PM"}`;
}

export function getAudioTrackNames({ tracks = [], desktopTrack = null, otherAppsTrack = null } = {}) {
  return [
    { index: 1, name: "Full mix", kind: "mix" },
    ...tracks.map((track) => ({
      index: track.index,
      name: track.kind === "mic" ? "Microphone" : track.kind === "game" ? "Game" : track.name || track.exe,
      kind: track.kind,
    })),
    ...(desktopTrack ? [{ index: desktopTrack, name: "Desktop audio", kind: "desktop" }] : []),
    ...(otherAppsTrack ? [{ index: otherAppsTrack, name: "Other apps", kind: "other" }] : []),
  ];
}

export function buildClipManifest({ folderName, createdAt, seconds, game, primary, secondaries = [] }) {
  return {
    version: 1,
    createdAt,
    seconds,
    game: game || null,
    files: [
      {
        file: `${folderName}.mp4`,
        role: "primary",
        follows: primary.follows,
        screen: primary.screen || null,
        audioTracks: primary.audioTracks,
      },
      ...secondaries.map((secondary) => ({
        file: `Screen ${secondary.screen.number}.mp4`,
        role: "secondary",
        follows: false,
        screen: secondary.screen,
        audioTracks: [],
      })),
    ],
  };
}

export function getScreenCount(files) {
  const secondaryCount = files.filter((file) => file.role === "secondary").length;
  return files.find((file) => file.role === "primary")?.follows ? secondaryCount : secondaryCount + 1;
}

export function describeClip(manifest) {
  const screenCount = getScreenCount(manifest.files);
  return [
    manifest.game?.name,
    `last ${manifest.seconds} s`,
    screenCount > 1 ? `${screenCount} screens` : null,
  ].filter(Boolean).join(" · ");
}

export function getManifestFile(manifest, fileName) {
  const name = String(fileName || "").toLowerCase();
  return manifest?.files?.find((entry) => String(entry.file).toLowerCase() === name) || null;
}

export function renameManifestFile(manifest, oldName, newName) {
  const entry = getManifestFile(manifest, oldName);
  if (!entry) {
    return null;
  }

  return { ...manifest, files: manifest.files.map((file) => (file === entry ? { ...file, file: newName } : file)) };
}

export function removeManifestFile(manifest, fileName) {
  const entry = getManifestFile(manifest, fileName);
  return entry ? { ...manifest, files: manifest.files.filter((file) => file !== entry) } : null;
}

export function keepManifestFile(manifest, fileName, newName = fileName) {
  const entry = getManifestFile(manifest, fileName);
  const primary = manifest?.files?.find((file) => file.role === "primary");
  if (!entry || !primary) {
    return null;
  }

  const kept = entry === primary
    ? primary
    : { ...entry, file: newName, role: "primary", follows: false, audioTracks: primary.audioTracks };
  return { ...manifest, files: [kept] };
}
