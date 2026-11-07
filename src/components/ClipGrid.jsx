import ClipCard from "./ClipCard.jsx";
import "./clipgrid.css";
import { formatSessionTime, groupClipSessions } from "../lib/clipSessions.js";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const GAP = 20;
const MIN_CARD_WIDTH = 270;
const INITIAL_SKELETON_COUNT = 16;
const SESSION_HEADER_HEIGHT = 40;

function ClipGrid({
  clips,
  baseFolder,
  onSelect,
  onDelete,
  onContextMenuAction,
  contextMenuRef,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  scrollElement,
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setContainerWidth(element.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columnCount = useMemo(() => {
    if (!containerWidth) return 1;
    return Math.max(1, Math.floor((containerWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
  }, [containerWidth]);

  const cardWidth = useMemo(() => {
    if (!containerWidth) return MIN_CARD_WIDTH;
    return (containerWidth - GAP * (columnCount - 1)) / columnCount;
  }, [columnCount, containerWidth]);

  const rowHeight = useMemo(() => {
    const thumbWidth = Math.max(160, cardWidth - 20);
    const thumbnailHeight = (thumbWidth * 9) / 16;
    return Math.ceil(thumbnailHeight + 94 + GAP);
  }, [cardWidth]);

  const dataRows = useMemo(() => {
    if (loading && clips.length === 0) {
      return Array.from({ length: Math.ceil(INITIAL_SKELETON_COUNT / columnCount) }, () => ({ type: "skeleton" }));
    }

    return groupClipSessions(clips).flatMap((session, index) => {
      const header = session.id || index > 0 ? [{ type: "header", session }] : [];
      const cardRows = Array.from({ length: Math.ceil(session.clips.length / columnCount) }, (_, rowIndex) => ({
        type: "clips",
        clips: session.clips.slice(rowIndex * columnCount, (rowIndex + 1) * columnCount),
      }));
      return [...header, ...cardRows];
    });
  }, [clips, columnCount, loading]);

  const getRowSize = (index) => (dataRows[index]?.type === "header" ? SESSION_HEADER_HEIGHT : rowHeight);
  const dataRowCount = dataRows.length;
  const loaderRowCount = !loading && clips.length > 0 && (hasMore || loadingMore) ? 1 : 0;
  const rowCount = dataRowCount + loaderRowCount;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: getRowSize,
    overscan: 4,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [dataRows, rowHeight, rowVirtualizer]);

  const virtualRows = scrollElement
    ? rowVirtualizer.getVirtualItems()
    : Array.from({ length: Math.min(rowCount, 6) }, (_, index) => ({
        key: `fallback-${index}`,
        index,
        start: Array.from({ length: index }, (_, previous) => getRowSize(previous)).reduce((sum, size) => sum + size, 0),
        size: getRowSize(index),
      }));

  useEffect(() => {
    const lastVirtualRow = virtualRows[virtualRows.length - 1];
    if (!lastVirtualRow || loading || loadingMore || !hasMore) {
      return;
    }

    if (lastVirtualRow.index >= Math.max(0, dataRowCount - 3)) {
      onLoadMore?.();
    }
  }, [dataRowCount, hasMore, loading, loadingMore, onLoadMore, virtualRows]);

  if (!loading && clips.length === 0 && !hasMore) {
    return <div className="clip-grid clip-grid-virtual" ref={containerRef} />;
  }

  return (
    <div className="clip-grid clip-grid-virtual" ref={containerRef}>
      <div
        className="clip-grid-virtual-spacer"
        style={{ height: scrollElement ? rowVirtualizer.getTotalSize() : rowCount * rowHeight }}
      >
        {virtualRows.map((virtualRow) => {
          const row = dataRows[virtualRow.index];
          const isLoaderRow = virtualRow.index >= dataRowCount;
          const rowItems = Array.from({ length: columnCount }, (_, columnIndex) => columnIndex);

          if (row?.type === "header") {
            return (
              <div
                key={virtualRow.key}
                className="clip-grid-row clip-session-header"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.session.id ? (
                  <>
                    <span className="clip-session-game">{row.session.gameName || "Gaming session"}</span>
                    <span className="clip-session-meta">
                      {formatSessionTime(row.session.clips)} · {row.session.clips.length === 1 ? "1 clip" : `${row.session.clips.length} clips`}
                    </span>
                  </>
                ) : (
                  <span className="clip-session-game">Other clips</span>
                )}
              </div>
            );
          }

          return (
            <div
              key={virtualRow.key}
              className={`clip-grid-row ${isLoaderRow ? "clip-grid-loader-row" : ""}`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${GAP}px`,
              }}
            >
              {isLoaderRow
                ? rowItems.map((_, columnIndex) => (
                    <ClipCardSkeleton key={`loader-skeleton-${virtualRow.index}-${columnIndex}`} />
                  ))
                : rowItems.map((columnIndex) => {
                    if (row.type === "skeleton") {
                      return <ClipCardSkeleton key={`clip-skeleton-${virtualRow.index}-${columnIndex}`} />;
                    }

                    const clip = row.clips[columnIndex];
                    if (!clip) {
                      return <div key={`filler-${virtualRow.index}-${columnIndex}`} className="clip-card filler" />;
                    }

                    return (
                      <ClipCard
                        key={clip.path || clip.id}
                        clip={clip}
                        baseFolder={baseFolder}
                        onClick={() => onSelect(clip)}
                        onDelete={onDelete}
                        onContextMenuAction={onContextMenuAction}
                      />
                    );
                  })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClipCardSkeleton() {
  return (
    <div className="clip-card clip-card-skeleton" aria-hidden="true">
      <div className="skeleton-thumb" />
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-date" />
    </div>
  );
}

export default ClipGrid;
