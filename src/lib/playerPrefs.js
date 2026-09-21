import { useEffect, useState } from "react";

const VOLUME_STORAGE_KEY = "clipx:volume";
const MUTED_STORAGE_KEY = "clipx:muted";

function clampVolume(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

// Synchronous localStorage read for useState init. localStorage is scoped
// to the renderer origin, and the packaged build serves from a random port
// each launch, so this alone can't persist between packaged sessions. It is
// still the fastest source on first render and the fallback outside Electron.
export function readSavedVolume() {
  const stored = globalThis.localStorage?.getItem(VOLUME_STORAGE_KEY);
  if (stored === null || stored === undefined) {
    return 1;
  }
  return clampVolume(Number(stored));
}

export function readSavedMuted() {
  const stored = globalThis.localStorage?.getItem(MUTED_STORAGE_KEY);
  return stored === "true";
}

// Origin-independent load via the main process. Returns null when nothing
// was ever stored so callers keep their (correctly defaulted) local values.
export async function loadPlayerPrefs() {
  if (typeof window?.clipx?.authStorageGet !== "function") {
    return null;
  }

  try {
    const [storedVolume, storedMuted] = await Promise.all([
      window.clipx.authStorageGet(VOLUME_STORAGE_KEY),
      window.clipx.authStorageGet(MUTED_STORAGE_KEY),
    ]);

    if (storedVolume === null && storedMuted === null) {
      return null;
    }

    return {
      volume: storedVolume === null ? 1 : clampVolume(Number(storedVolume)),
      muted: storedMuted === "true",
    };
  } catch (error) {
    console.error("Failed to load player prefs:", error);
    return null;
  }
}

export async function savePlayerPrefs(volume, muted) {
  globalThis.localStorage?.setItem(VOLUME_STORAGE_KEY, String(volume));
  globalThis.localStorage?.setItem(MUTED_STORAGE_KEY, String(muted));

  if (typeof window?.clipx?.authStorageSet !== "function") {
    return;
  }

  try {
    await Promise.all([
      window.clipx.authStorageSet(VOLUME_STORAGE_KEY, String(volume)),
      window.clipx.authStorageSet(MUTED_STORAGE_KEY, String(muted)),
    ]);
  } catch (error) {
    console.error("Failed to save player prefs:", error);
  }
}

// Shared volume/mute state for every VideoPlayer host (ClipEditor, Library
// preview). Defaults are unmuted; stored prefs hydrate after mount.
export function usePlayerPrefs() {
  const [volume, setVolume] = useState(() => readSavedVolume());
  const [muted, setMuted] = useState(() => readSavedMuted());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadPlayerPrefs().then((prefs) => {
      if (cancelled) {
        return;
      }
      if (prefs) {
        setVolume(prefs.volume);
        setMuted(prefs.muted);
      }
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void savePlayerPrefs(volume, muted);
  }, [volume, muted, hydrated]);

  return { volume, muted, setVolume, setMuted };
}
