import { useEffect, useRef } from "react";

const DRIFT_SECONDS = 0.08;
const VIDEO_EVENTS = ["play", "pause", "playing", "waiting", "seeking", "ratechange", "timeupdate"];

export function toClipxUrl(filePath) {
  return `clipx://video?path=${encodeURIComponent(filePath)}`;
}

export function syncMedia(media, target, playing, rate, force = false) {
  if (media.readyState === 0) {
    return;
  }

  const inRange = target >= 0 && target < media.duration;
  const time = inRange ? target : Math.max(0, Math.min(target, media.duration));
  if (force || Math.abs(media.currentTime - time) > DRIFT_SECONDS) {
    media.currentTime = time;
  }
  media.playbackRate = rate;
  if (playing && inRange && media.paused) {
    media.play().catch(() => {});
  } else if ((!playing || !inRange) && !media.paused) {
    media.pause();
  }
}

export function onVideoSync(video, sync) {
  const onTick = () => video.readyState > 0 && sync(false);
  const onSeeked = () => video.readyState > 0 && sync(true);
  VIDEO_EVENTS.forEach((name) => video.addEventListener(name, onTick));
  video.addEventListener("seeked", onSeeked);
  return () => {
    VIDEO_EVENTS.forEach((name) => video.removeEventListener(name, onTick));
    video.removeEventListener("seeked", onSeeked);
  };
}

function createTrackMixer(video) {
  const context = new AudioContext();
  const videoGain = context.createGain();
  const limiter = new DynamicsCompressorNode(context, { threshold: 0, knee: 0, ratio: 20, attack: 0 });
  const master = context.createGain();
  context.createMediaElementSource(video).connect(videoGain).connect(context.destination);
  limiter.connect(master).connect(context.destination);

  let stems = [];
  let settings = { mix: null, offset: 0, external: false, volume: 1, muted: false };

  const isAudible = () => Boolean(settings.mix || settings.external) && stems.length > 0;

  function sync(force = false) {
    if (video.readyState === 0) {
      return;
    }
    const playing = isAudible() && !video.paused && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    for (const { audio } of stems) {
      syncMedia(audio, video.currentTime + settings.offset, playing, video.playbackRate, force);
    }
  }

  function apply() {
    videoGain.gain.value = isAudible() ? 0 : 1;
    master.gain.value = settings.muted ? 0 : settings.volume;
    for (const stem of stems) {
      const mixVolume = settings.mix?.find((track) => track.index === stem.index)?.volume;
      stem.gain.gain.value = stem.index === 1 ? (settings.mix ? 0 : 1) : (mixVolume ?? 0);
    }
    if (isAudible()) {
      context.resume().catch(() => {});
    }
    sync();
  }

  function clearStems() {
    for (const { audio } of stems) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    stems = [];
    apply();
  }

  const stopSync = onVideoSync(video, sync);

  return {
    video,
    setSettings(nextSettings) {
      const offsetChanged = nextSettings.offset !== settings.offset;
      settings = nextSettings;
      apply();
      if (offsetChanged) {
        sync(true);
      }
    },
    setStems(tracks) {
      clearStems();
      stems = tracks.map((track) => {
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.src = toClipxUrl(track.path);
        audio.addEventListener("loadedmetadata", () => sync(true), { once: true });
        const gain = context.createGain();
        context.createMediaElementSource(audio).connect(gain).connect(limiter);
        return { index: track.index, audio, gain };
      });
      apply();
    },
    clearStems,
    close() {
      stopSync();
      clearStems();
      context.close().catch(() => {});
    },
  };
}

export function useTrackMix(playerRef, clipPath, { mix, offset = 0, external = false }, volume, muted) {
  const mixerRef = useRef(null);
  const stemsPathRef = useRef(null);

  useEffect(() => () => {
    mixerRef.current?.close();
    window.clipx?.releaseClipTracks?.().catch(() => {});
  }, []);

  useEffect(() => {
    const video = playerRef.current?.element;
    if (mixerRef.current && mixerRef.current.video !== video) {
      mixerRef.current.close();
      mixerRef.current = null;
      stemsPathRef.current = null;
    }
    if (!mixerRef.current && (mix || external) && video) {
      mixerRef.current = createTrackMixer(video);
    }

    const mixer = mixerRef.current;
    if (!mixer) {
      return;
    }

    if (stemsPathRef.current && stemsPathRef.current !== clipPath) {
      stemsPathRef.current = null;
      mixer.clearStems();
    }
    mixer.setSettings({ mix, offset, external, volume, muted });

    if ((mix || external) && !stemsPathRef.current) {
      stemsPathRef.current = clipPath;
      window.clipx.extractClipTracks(clipPath)
        .then((tracks) => {
          if (stemsPathRef.current === clipPath) {
            mixer.setStems(tracks);
          }
        })
        .catch((error) => {
          console.error("Failed to load the clip's audio tracks:", error);
          stemsPathRef.current = null;
        });
    }
  }, [playerRef, clipPath, mix, offset, external, volume, muted]);
}
