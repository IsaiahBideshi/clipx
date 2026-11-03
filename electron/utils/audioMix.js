const MAX_TRACK_VOLUME = 2;

export function getMixTracks(audioTracks) {
  const tracks = Array.isArray(audioTracks) ? audioTracks : [];
  return tracks.length > 1 && tracks.every((track) => track.kind)
    ? tracks.filter((track) => track.kind !== "mix")
    : [];
}

export function buildMix(tracks, levels) {
  const mix = tracks.map((track) => {
    const level = levels?.[track.index];
    return { index: track.index, volume: level?.muted ? 0 : (level?.volume ?? 100) / 100 };
  });
  return mix.some((track) => track.volume !== 1) ? mix : null;
}

export function buildAudioOutputOptions(mix, audioInput = 0) {
  const tracks = (Array.isArray(mix) ? mix : [])
    .filter((track) => Number.isInteger(track?.index) && track.index > 1)
    .map((track) => ({ index: track.index, volume: Math.min(Math.max(Number(track.volume) || 0, 0), MAX_TRACK_VOLUME) }));

  if (!tracks.length) {
    return ["-map", "0:v:0", "-map", `${audioInput}:a:0?`, "-c", "copy"];
  }

  const inputs = tracks.map((track, position) => `[${audioInput}:a:${track.index - 1}]volume=${track.volume}[a${position}]`).join(";");
  const labels = tracks.map((_track, position) => `[a${position}]`).join("");
  return [
    "-filter_complex", `${inputs};${labels}amix=inputs=${tracks.length}:normalize=0,alimiter=level=false:latency=true[mix]`,
    "-map", "0:v:0",
    "-map", "[mix]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
  ];
}
