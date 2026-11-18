import { useEffect, useRef } from "react";

const DRIFT_SECONDS = 0.08;
const VIDEO_EVENTS = ["emptied", "play", "pause", "playing", "waiting", "seeking", "seeked", "ratechange", "timeupdate"];

export function toClipxUrl(filePath) {
  return `clipx://video?path=${encodeURIComponent(filePath)}`;
}

export function syncMedia(media, target, playing, rate, lead = 0) {
  if (media.readyState === 0) {
    return;
  }

  const inRange = target > -DRIFT_SECONDS && target < media.duration;
  const time = Math.max(0, Math.min(target, media.duration));
  if (!media.seeking && Math.abs(media.currentTime - time) > DRIFT_SECONDS) {
    media.currentTime = Math.min(time + (playing ? lead * rate : 0), media.duration);
  }
  media.playbackRate = rate;
  if (playing && inRange && media.paused) {
    media.play().catch(() => {});
  } else if ((!playing || !inRange) && !media.paused) {
    media.pause();
  }
}

export function onVideoSync(video, sync) {
  VIDEO_EVENTS.forEach((name) => video.addEventListener(name, sync));
  return () => VIDEO_EVENTS.forEach((name) => video.removeEventListener(name, sync));
}

function createTrackMixer(video) {
  const context = new AudioContext();
  const videoGain = context.createGain();
  const limiter = new DynamicsCompressorNode(context, { threshold: 0, knee: 0, ratio: 20, attack: 0 });
  const master = context.createGain();
  context.createMediaElementSource(video).connect(videoGain).connect(context.destination);
  limiter.connect(master).connect(context.destination);

  let stems = [];
  let pending = [];
  let settings = { mix: null, offset: 0, external: false, volume: 1, muted: false };
  let closed = false;

  const isAudible = () => Boolean(settings.mix || settings.external) && stems.length > 0;
  const isReady = ({ audio }) => audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !audio.seeking;

  function sync() {
    if (video.readyState === 0 || video.seeking) {
      [...stems, ...pending].forEach(({ audio }) => audio.pause());
      return;
    }
    const running = !video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    const target = video.currentTime + settings.offset;
    for (const { audio, lead } of stems) {
      syncMedia(audio, target, running && isAudible(), video.playbackRate, lead);
    }
    for (const { audio, lead } of pending) {
      syncMedia(audio, target, running, video.playbackRate, lead);
    }
    if (pending.length && pending.every(isReady)) {
      removeStems(stems);
      stems = pending;
      pending = [];
      apply();
    }
  }

  function apply() {
    videoGain.gain.value = isAudible() ? 0 : 1;
    master.gain.value = settings.muted ? 0 : settings.volume;
    for (const stem of stems) {
      const mixVolume = settings.mix?.find((track) => track.index === stem.index)?.volume;
      stem.gain.gain.value = stem.index === 1 ? (settings.mix && stems.length > 1 ? 0 : 1) : (mixVolume ?? 0);
    }
    if (isAudible()) {
      context.resume().catch(() => {});
    }
    sync();
  }

  function createStem(track) {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = toClipxUrl(track.path);
    const gain = new GainNode(context, { gain: 0 });
    context.createMediaElementSource(audio).connect(gain).connect(limiter);
    const stem = { index: track.index, audio, gain, lead: 0, seekStart: 0 };
    audio.addEventListener("loadedmetadata", sync, { once: true });
    audio.addEventListener("seeking", () => {
      stem.seekStart = performance.now();
    });
    audio.addEventListener("seeked", () => {
      stem.lead = (performance.now() - stem.seekStart) / 1000;
      sync();
    });
    return stem;
  }

  function removeStems(list) {
    for (const { audio, gain } of list) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      gain.disconnect();
    }
  }

  function clearStems() {
    removeStems([...stems, ...pending]);
    stems = [];
    pending = [];
    apply();
  }

  const stopSync = onVideoSync(video, sync);

  return {
    video,
    setSettings(nextSettings) {
      settings = nextSettings;
      apply();
    },
    setStems(tracks) {
      if (closed) {
        return;
      }
      removeStems(pending);
      pending = tracks.map(createStem);
      sync();
    },
    clearStems,
    close() {
      closed = true;
      stopSync();
      clearStems();
      context.close().catch(() => {});
    },
  };
}

export function useTrackMix(playerRef, clipPath, { mix, offset = 0, external = false }, volume, muted) {
  const mixerRef = useRef(null);
  const stemsRef = useRef(null);

  useEffect(() => () => mixerRef.current?.close(), []);

  useEffect(() => {
    const video = playerRef.current?.element;
    if (mixerRef.current && mixerRef.current.video !== video) {
      mixerRef.current.close();
      mixerRef.current = null;
      stemsRef.current = null;
    }
    if (!mixerRef.current && (mix || external) && video) {
      mixerRef.current = createTrackMixer(video);
    }

    const mixer = mixerRef.current;
    if (!mixer) {
      return;
    }

    if (stemsRef.current && stemsRef.current.path !== clipPath) {
      stemsRef.current = null;
      mixer.clearStems();
    }
    mixer.setSettings({ mix, offset, external, volume, muted });

    if (external && !stemsRef.current) {
      stemsRef.current = { path: clipPath };
      mixer.setStems([{ index: 1, path: clipPath }]);
    }

    if ((mix || external) && !stemsRef.current?.extracted) {
      const request = { path: clipPath, extracted: true };
      stemsRef.current = request;
      window.clipx.extractClipTracks(clipPath)
        .then((tracks) => {
          if (stemsRef.current === request) {
            mixer.setStems(tracks);
          }
        })
        .catch((error) => {
          console.error("Failed to load the clip's audio tracks:", error);
          if (stemsRef.current === request) {
            stemsRef.current = { path: clipPath };
          }
        });
    }
  }, [playerRef, clipPath, mix, offset, external, volume, muted]);
}
