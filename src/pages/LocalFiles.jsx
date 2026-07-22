import "../App.css";
import "./localfiles.css";
import ClipGrid from "../components/ClipGrid.jsx";
import ClipEditor from "../components/ClipEditor.jsx";
import SavingClipsWidget from "../components/SavingClipsWidget.jsx";
import UploadingClipsWidget from "../components/UploadingClipsWidget.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Switch } from "@mui/material";
import { isTextEntryActive } from "../lib/hotkeys.js";

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

const PAGE_SIZE = 60;
const TOP_INSERT_THRESHOLD = 120;
const LOAD_MORE_SCROLL_THRESHOLD = 700;
const LOCAL_CLIPS_STALE_MS = 5 * 60 * 1000;

async function fetchLocalOptions() {
  if (typeof window.clipx?.getOptions !== "function") {
    throw new Error("window.clipx.getOptions is not available (preload not wired?)");
  }

  return await window.clipx.getOptions();
}

function localClipsQueryKey(rootPath, collection, cursor = null) {
  return ["localFiles", "clips", rootPath, collection, cursor || null, PAGE_SIZE];
}

function getFreshCachedQueryData(queryClient, queryKey) {
  const queryState = queryClient.getQueryState(queryKey);
  const queryData = queryClient.getQueryData(queryKey);
  if (!queryState || !queryData || queryState.isInvalidated) {
    return null;
  }

  return Date.now() - queryState.dataUpdatedAt <= LOCAL_CLIPS_STALE_MS ? queryData : null;
}

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
  const [deleteClipModalOpen, setDeleteClipModalOpen] = useState(false);
  const [isDeletingClip, setIsDeletingClip] = useState(false);
  const [error, setError] = useState(null);
  const [clipToDelete, setClipToDelete] = useState(null);

  const deleteModalRef = useRef(null);
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
  const queryClient = useQueryClient();
  const optionsQuery = useQuery({
    queryKey: ["localFiles", "options"],
    queryFn: fetchLocalOptions,
    staleTime: 10 * 60 * 1000,
  });
  const options = optionsQuery.data || null;

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

  const applyClipsPage = useCallback((page, { reset = false } = {}) => {
    const pageClips = Array.isArray(page?.clips) ? page.clips : [];
    const nextCursor = page?.nextCursor || null;
    const nextHasMore = Boolean(page?.hasMore);

    setClips((currentClips) => (reset ? pageClips : mergeClipLists(currentClips, pageClips)));
    cursorRef.current = nextCursor;
    hasMoreRef.current = nextHasMore;
    setCursor(nextCursor);
    setHasMore(nextHasMore);
    setLoadingInitial(false);
  }, []);

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

      const pageCursor = reset ? null : cursorRef.current;
      const pageQueryKey = localClipsQueryKey(rootPath, collection, pageCursor);
      const cachedPage = getFreshCachedQueryData(queryClient, pageQueryKey);
      if (cachedPage) {
        applyClipsPage(cachedPage, { reset });
        return cachedPage;
      }

      const requestVersion = requestVersionRef.current;
      loadingPageRef.current = true;
      setLoadingPage(true);

      try {
        const page = await window.clipx.listLocalClips({
          rootPath,
          collection,
          limit: PAGE_SIZE,
          cursor: pageCursor,
        });

        if (requestVersion !== requestVersionRef.current) {
          return null;
        }

        queryClient.setQueryData(pageQueryKey, page);
        applyClipsPage(page, { reset });
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
    [applyClipsPage, collection, queryClient, rootPath]
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
    if (optionsQuery.isError) {
      console.error("Failed to load local file options:", optionsQuery.error);
      setLoadingInitial(false);
      return;
    }

    if (!options) {
      if (!optionsQuery.isLoading && !optionsQuery.isFetching) {
        setLoadingInitial(false);
      }
      return;
    }

    const nextRootPath = String(options?.clipsFolder || "").replace(/[\\/]+$/, "");
    setRootPath(nextRootPath);
    setFolderPath(showSavedFiles ? buildSavedClipsPath(nextRootPath) : nextRootPath);
  }, [options, optionsQuery.error, optionsQuery.isError, optionsQuery.isFetching, optionsQuery.isLoading, showSavedFiles]);

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
    const cachedFirstPage = getFreshCachedQueryData(queryClient, localClipsQueryKey(rootPath, collection));
    if (cachedFirstPage) {
      applyClipsPage(cachedFirstPage, { reset: true });
      setLoadingPage(false);
      setIndexing(false);
      setNewClipCount(0);
      return;
    }

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
  }, [applyClipsPage, collection, loadPage, queryClient, refreshTick, rootPath]);

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
    queryClient.invalidateQueries({ queryKey: ["localFiles", "clips", rootPath, collection] });
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
        setDeleteClipModalOpen(false);
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (deleteModalRef.current && !deleteModalRef.current.contains(event.target)) {
        setDeleteClipModalOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [deleteClipModalOpen]);

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
          onDelete={(clip) => {
            setClipToDelete(clip);
            setDeleteClipModalOpen(true);
          }}
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
        onDelete={(clip) => {
          setClipToDelete(clip);
          setDeleteClipModalOpen(true);
        }}
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
      {deleteClipModalOpen && (
        <div className="delete-modal">
          <div className="delete-modal-content" ref={deleteModalRef}>
            {isDeletingClip ? (
              <p>Deleting clip...</p>
            ) : (
              <>
                <div className="delete-modal-message">
                  Are you sure you want to delete this clip?
                </div>
                <div style={{ display: "flex", marginLeft: "auto", marginRight: "auto", marginTop: "20px", width: "fit-content", gap: "12px" }}>
                  <button className="cancel-button" onClick={() => setDeleteClipModalOpen(false)}>Cancel</button>
                  <button className="delete-button" onClick={async () => {
                      if (window.clipx?.deleteClip) {
                        try {
                          setIsDeletingClip(true);
                          const result = await window.clipx.deleteClip(clipToDelete.path);
                          queryClient.invalidateQueries({ queryKey: ["localFiles", "clips", rootPath, collection] });
                          setIsDeletingClip(false);
                          setClipToDelete(null);
                          if (clip){
                            moveSelectedClip(1);
                          }
                        } catch (error) {
                          setError(`${error.message}`);
                          console.error("Failed to delete clip:", error);
                          setIsDeletingClip(false);
                        }
                      }
                    setDeleteClipModalOpen(false);
                  }}>Delete</button>
                </div>
            </>)}
          </div>
        </div>
      )}

      {error && (
        <div className="error-modal">
          <p>{error}</p>
          <button className="cancel-button" onClick={() => setError(null)}>Ok</button>
        </div>
      )}
    </OverlayScrollbarsComponent>
  );
}
