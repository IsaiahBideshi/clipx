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

export function getAudioTrackNames(tracks = []) {
  return [
    { index: 1, name: "Full mix" },
    ...tracks.map((track) => ({
      index: track.index,
      name: track.kind === "mic" ? "Microphone" : track.kind === "game" ? "Game" : track.name || track.exe,
    })),
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

export function getManifestFile(manifest, fileName) {
  const name = String(fileName || "").toLowerCase();
  return manifest?.files?.find((entry) => String(entry.file).toLowerCase() === name) || null;
}
