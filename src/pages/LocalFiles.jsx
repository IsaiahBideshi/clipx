import "../App.css";
import "./localfiles.css";
import ClipGrid from "../components/ClipGrid.jsx";
import ClipEditor from "../components/ClipEditor.jsx";
import SavingClipsWidget from "../components/SavingClipsWidget.jsx";
import UploadingClipsWidget from "../components/UploadingClipsWidget.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Switch } from "@mui/material";
import { isTextEntryActive } from "../lib/hotkeys.js";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

const PAGE_SIZE = 60;
const TOP_INSERT_THRESHOLD = 120;
const LOAD_MORE_SCROLL_THRESHOLD = 700;

function buildSavedClipsPath(rootPath) {
  if (!rootPath) return "";
  return `${rootPath.replace(/[\\/]+$/, "")}\\ClipX Videos`;
}

function compareClips(a, b) {
  const createdDiff = Number(b.createdAt || 0) - Number(a.createdAt || 0);
  if (createdDiff !== 0) return createdDiff;
  return String(b.id || "").localeCompare(String(a.id || ""));
}

function mergeClipLists(currentClips, nextClips) {
  const clipsByPath = new Map();
  for (const clip of currentClips) {
    clipsByPath.set(clip.path, clip);
  }
  for (const clip of nextClips) {
    clipsByPath.set(clip.path, clip);
  }
  return Array.from(clipsByPath.values()).sort(compareClips);
}

function upsertClipInList(currentClips, clip) {
  return mergeClipLists(currentClips.filter((item) => item.path !== clip.path), [clip]);
}

export default function LocalFiles() {
  const [rootPath, setRootPath] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [showSavedFiles, setShowSavedFiles] = useState(false);
  const [clips, setClips] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [options, setOptions] = useState(null);
  const [clip, setClip] = useState(null);
  const [savingClips, setSavingClips] = useState([]);
  const [uploadingClips, setUploadingClips] = useState([]);
  const [showSavingList, setShowSavingList] = useState(true);
  const [showUploadingList, setShowUploadingList] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [newClipCount, setNewClipCount] = useState(0);
  const [scrollElement, setScrollElement] = useState(null);

  const overlayRef = useRef(null);
  const clipsRef = useRef([]);
  const clipRef = useRef(null);
  const cursorRef = useRef(null);
  const hasMoreRef = useRef(true);
  const loadingPageRef = useRef(false);
  const pendingResetRef = useRef(false);
  const requestVersionRef = useRef(0);
  const scrollElementRef = useRef(null);

  const collection = useMemo(() => (showSavedFiles ? "saved" : "source"), [showSavedFiles]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    clipRef.current = clip;
  }, [clip]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const updateScrollElement = useCallback(() => {
    const element =
      overlayRef.current?.osInstance?.()?.elements?.().viewport ||
      overlayRef.current?.getElement?.() ||
      null;

    if (element !== scrollElementRef.current) {
      scrollElementRef.current = element;
      setScrollElement(element);
    }
  }, []);

  const setOverlayRef = useCallback((node) => {
    overlayRef.current = node;
    updateScrollElement();
  }, [updateScrollElement]);

  useEffect(() => {
    if (!overlayRef.current) {
      return undefined;
    }

    updateScrollElement();
    const timeouts = [0, 100, 500].map((delay) => window.setTimeout(updateScrollElement, delay));
    return () => timeouts.forEach((timeout) => window.clearTimeout(timeout));
  }, [updateScrollElement]);

  useEffect(() => {
    scrollElementRef.current = scrollElement;
  }, [scrollElement]);

  const getScrollTop = useCallback(() => {
    return scrollElement?.scrollTop ?? overlayRef.current?.getElement?.()?.scrollTop ?? 0;
  }, [scrollElement]);

  const scrollToTop = useCallback(() => {
    const element = scrollElement || overlayRef.current?.getElement?.();
    element?.scrollTo?.({ top: 0, behavior: "smooth" });
  }, [scrollElement]);

  const loadPage = useCallback(
    async ({ reset = false } = {}) => {
      if (!rootPath || typeof window.clipx?.listLocalClips !== "function") {
        setLoadingInitial(false);
        return null;
      }

      if (loadingPageRef.current) {
        if (reset) {
          pendingResetRef.current = true;
        }
        return null;
      }

      if (!reset && !hasMoreRef.current) {
        return null;
      }

      const requestVersion = requestVersionRef.current;
      loadingPageRef.current = true;
      setLoadingPage(true);

      try {
        const page = await window.clipx.listLocalClips({
          rootPath,
          collection,
          limit: PAGE_SIZE,
          cursor: reset ? null : cursorRef.current,
        });

        if (requestVersion !== requestVersionRef.current) {
          return null;
        }

        const pageClips = Array.isArray(page?.clips) ? page.clips : [];
        setClips((currentClips) => (reset ? pageClips : mergeClipLists(currentClips, pageClips)));
        setCursor(page?.nextCursor || null);
        setHasMore(Boolean(page?.hasMore));
        setLoadingInitial(false);
        return page;
      } catch (error) {
        console.error("Failed to load local clips:", error);
        if (requestVersion === requestVersionRef.current) {
          if (reset) {
            setClips([]);
          }
          setHasMore(false);
          setLoadingInitial(false);
        }
        return null;
      } finally {
        if (requestVersion === requestVersionRef.current) {
          loadingPageRef.current = false;
          setLoadingPage(false);

          if (pendingResetRef.current) {
            pendingResetRef.current = false;
            window.setTimeout(() => loadPage({ reset: true }), 0);
          }
        }
      }
    },
    [collection, rootPath]
  );

  const loadNextPage = useCallback(() => loadPage(), [loadPage]);

  const maybeLoadMoreFromScroll = useCallback(() => {
    const element = scrollElementRef.current || overlayRef.current?.getElement?.();
    if (!element || loadingPageRef.current || !hasMoreRef.current) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom <= LOAD_MORE_SCROLL_THRESHOLD) {
      loadNextPage();
    }
  }, [loadNextPage]);

  useEffect(() => {
    const element = scrollElement;
    if (!element) {
      return undefined;
    }

    let rafId = 0;
    const onScroll = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        maybeLoadMoreFromScroll();
      });
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    maybeLoadMoreFromScroll();

    return () => {
      element.removeEventListener("scroll", onScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [maybeLoadMoreFromScroll, scrollElement]);

  useEffect(() => {
    maybeLoadMoreFromScroll();
  }, [clips.length, hasMore, maybeLoadMoreFromScroll]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      if (typeof window.clipx?.getOptions !== "function") {
        console.error("window.clipx.getOptions is not available (preload not wired?)");
        setLoadingInitial(false);
        return;
      }

      const nextOptions = await window.clipx.getOptions();
      if (cancelled) return;

      const nextRootPath = String(nextOptions?.clipsFolder || "").replace(/[\\/]+$/, "");
      setOptions(nextOptions);
      setRootPath(nextRootPath);
      setFolderPath(showSavedFiles ? buildSavedClipsPath(nextRootPath) : nextRootPath);
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [showSavedFiles]);

  useEffect(() => {
    if (!rootPath) {
      setClips([]);
      setLoadingInitial(false);
      return;
    }

    let cancelled = false;
    requestVersionRef.current += 1;
    clipsRef.current = [];
    cursorRef.current = null;
    hasMoreRef.current = true;
    loadingPageRef.current = false;
    pendingResetRef.current = false;
    setClips([]);
    setCursor(null);
    setHasMore(true);
    setLoadingInitial(true);
    setLoadingPage(false);
    setIndexing(true);
    setNewClipCount(0);

    async function startIndexAndLoad() {
      try {
        if (typeof window.clipx?.refreshLocalClipIndex === "function") {
          await window.clipx.refreshLocalClipIndex({ rootPath });
        }
      } catch (error) {
        console.error("Failed to refresh local clip index:", error);
        setIndexing(false);
      }

      if (!cancelled) {
        await loadPage({ reset: true });
      }
    }

    startIndexAndLoad();
    return () => {
      cancelled = true;
    };
  }, [collection, loadPage, refreshTick, rootPath]);

  useEffect(() => {
    if (typeof window.clipx?.onLocalClipIndexChanged !== "function" || !rootPath) {
      return undefined;
    }

    return window.clipx.onLocalClipIndexChanged((event) => {
      if (!event || event.rootPath !== rootPath) {
        return;
      }

      if (event.type === "indexing-status") {
        setIndexing(Boolean(event.indexing));
        if (!event.indexing) {
          loadPage({ reset: true });
        }
        return;
      }

      if (event.collection !== collection) {
        return;
      }

      if (event.type === "removed" && event.clip?.path) {
        setClips((currentClips) => currentClips.filter((item) => item.path !== event.clip.path));
        return;
      }

      if ((event.type === "added" || event.type === "updated") && event.clip?.path) {
        const clipAlreadyLoaded = clipsRef.current.some((item) => item.path === event.clip.path);
        if (clipAlreadyLoaded || getScrollTop() < TOP_INSERT_THRESHOLD) {
          setClips((currentClips) => upsertClipInList(currentClips, event.clip));
        } else {
          setNewClipCount((count) => count + 1);
        }
      }
    });
  }, [collection, getScrollTop, loadPage, rootPath]);

  const refreshFiles = () => {
    setRefreshTick((tick) => tick + 1);
  };

  const showNewClips = () => {
    setNewClipCount(0);
    scrollToTop();
    loadPage({ reset: true });
  };

  const moveSelectedClip = useCallback(
    async (direction) => {
      const loadedClips = clipsRef.current;
      if (!loadedClips.length) {
        const page = hasMoreRef.current ? await loadNextPage() : null;
        const freshClips = Array.isArray(page?.clips) ? page.clips : clipsRef.current;
        if (freshClips.length) {
          setClip(direction > 0 ? freshClips[0] : freshClips[freshClips.length - 1]);
        }
        return;
      }

      const currentClip = clipRef.current;
      if (!currentClip) {
        setClip(direction > 0 ? loadedClips[0] : loadedClips[loadedClips.length - 1]);
        return;
      }

      const currentIndex = loadedClips.findIndex((item) => item.path === currentClip.path);
      if (currentIndex < 0) {
        setClip(direction > 0 ? loadedClips[0] : loadedClips[loadedClips.length - 1]);
        return;
      }

      const nextIndex = currentIndex + direction;
      if (nextIndex >= loadedClips.length && direction > 0 && hasMoreRef.current) {
        const page = await loadNextPage();
        const nextClip = page?.clips?.[0];
        if (nextClip) {
          setClip(nextClip);
        }
        return;
      }

      const clampedIndex = Math.max(0, Math.min(loadedClips.length - 1, nextIndex));
      setClip(loadedClips[clampedIndex]);
    },
    [loadNextPage]
  );

  useEffect(() => {
    function onKeyDown(e) {
      if (isTextEntryActive(e)) return;

      if (e.code === "Escape") {
        setClip(null);
      }

      if (e.ctrlKey && e.code === "ArrowLeft") {
        e.preventDefault();
        moveSelectedClip(-1);
      }

      if (e.ctrlKey && e.code === "ArrowRight") {
        e.preventDefault();
        moveSelectedClip(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSelectedClip]);

  function upsertSavingClip(id, nextValues) {
    setSavingClips((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...nextValues } : item))
    );
  }

  function removeSavingClip(id) {
    setSavingClips((prev) => prev.filter((item) => item.id !== id));
  }

  function upsertUploadingClip(id, nextValues) {
    setUploadingClips((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...nextValues } : item))
    );
  }

  function removeUploadingClip(id) {
    setUploadingClips((prev) => prev.filter((item) => item.id !== id));
  }

  function handleSaveQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      setSavingClips((prev) => [...prev, { id: event.id, name: event.name || "Untitled Clip", status: "saving" }]);
      return;
    }

    if (event.type === "success") {
      removeSavingClip(event.id);
      return;
    }

    if (event.type === "failed") {
      upsertSavingClip(event.id, { status: "failed" });
      setTimeout(() => removeSavingClip(event.id), 5000);
    }
  }

  function handleUploadQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      setUploadingClips((prev) => [
        ...prev,
        { id: event.id, name: event.name || "Untitled Clip", status: "uploading" },
      ]);
      return;
    }

    if (event.type === "success") {
      upsertUploadingClip(event.id, {
        status: "uploaded",
        youtubeUrl: event.youtubeUrl,
        videoId: event.videoId,
      });
      setTimeout(() => removeUploadingClip(event.id), 15000);
      return;
    }

    if (event.type === "failed") {
      upsertUploadingClip(event.id, { status: "failed" });
      setTimeout(() => removeUploadingClip(event.id), 7000);
    }
  }

  const gridLoading = loadingInitial || (indexing && clips.length === 0);

  return (
    <OverlayScrollbarsComponent
      ref={setOverlayRef}
      className="local-files-page"
      defer
      options={{ scrollbars: { autoHide: "scroll", theme: "os-theme-dark" } }}
    >
      {options && (
        <div className="local-files-header">
          <RefreshIcon
            className="local-files-refresh"
            fontSize="large"
            sx={{ cursor: "pointer" }}
            onClick={refreshFiles}
          />
          <span className="local-files-toggle-label">Saved Clips</span>
          <Switch
            className="local-files-toggle"
            checked={showSavedFiles}
            onChange={(e) => setShowSavedFiles(e.target.checked)}
          />
        </div>
      )}

      {folderPath && <pre className="local-files-path">Folder: {folderPath}</pre>}

      {newClipCount > 0 && (
        <button type="button" className="local-files-new-clips" onClick={showNewClips}>
          {newClipCount === 1 ? "1 new clip" : `${newClipCount} new clips`}
        </button>
      )}

      {/* {indexing && <p className="local-files-indexing">Indexing clips...</p>} */}

      {clip && (
        <ClipEditor
          clip={clip}
          onSaveQueueEvent={handleSaveQueueEvent}
          onUploadQueueEvent={handleUploadQueueEvent}
          isSavedClipsView={showSavedFiles}
          onClose={() => setClip(null)}
        />
      )}

      <ClipGrid
        clips={clips}
        baseFolder={folderPath}
        onSelect={(selectedClip) => setClip(selectedClip)}
        loading={gridLoading}
        loadingMore={loadingPage && clips.length > 0}
        hasMore={hasMore}
        onLoadMore={loadNextPage}
        scrollElement={scrollElement}
      />

      {!clips.length && !gridLoading && !indexing && (
        <p className="local-files-empty">No clips found in the selected folder.</p>
      )}

      <SavingClipsWidget
        clips={savingClips}
        expanded={showSavingList}
        onToggleExpanded={() => setShowSavingList((prev) => !prev)}
      />
      <UploadingClipsWidget
        clips={uploadingClips}
        expanded={showUploadingList}
        onToggleExpanded={() => setShowUploadingList((prev) => !prev)}
      />
    </OverlayScrollbarsComponent>
  );
}
