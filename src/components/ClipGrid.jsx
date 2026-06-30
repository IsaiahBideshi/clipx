import ClipCard from "./ClipCard.jsx";
import "./clipgrid.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const GAP = 20;
const MIN_CARD_WIDTH = 270;
const INITIAL_SKELETON_COUNT = 16;

function ClipGrid({
  clips,
  baseFolder,
  onSelect,
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
    const thumbWidth = Math.max(160, cardWidth - 24);
    const thumbnailHeight = (thumbWidth * 9) / 16;
    return Math.ceil(thumbnailHeight + 98 + GAP);
  }, [cardWidth]);

  const itemCount = loading && clips.length === 0 ? INITIAL_SKELETON_COUNT : clips.length;
  const dataRowCount = Math.ceil(itemCount / columnCount);
  const loaderRowCount = !loading && (hasMore || loadingMore) ? 1 : 0;
  const rowCount = dataRowCount + loaderRowCount;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [clips.length, columnCount, rowHeight, rowVirtualizer]);

  const virtualRows = scrollElement
    ? rowVirtualizer.getVirtualItems()
    : Array.from({ length: Math.min(rowCount, 6) }, (_, index) => ({
        key: `fallback-${index}`,
        index,
        start: index * rowHeight,
        size: rowHeight,
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
          const rowStartIndex = virtualRow.index * columnCount;
          const isLoaderRow = virtualRow.index >= dataRowCount;
          const rowItems = Array.from({ length: columnCount }, (_, columnIndex) => rowStartIndex + columnIndex);

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
                : rowItems.map((clipIndex) => {
                    if (loading && clips.length === 0) {
                      return <ClipCardSkeleton key={`clip-skeleton-${clipIndex}`} />;
                    }

                    const clip = clips[clipIndex];
                    if (!clip) {
                      return <div key={`filler-${virtualRow.index}-${clipIndex}`} className="clip-card filler" />;
                    }

                    return (
                      <ClipCard
                        key={clip.path || clip.id}
                        clip={clip}
                        baseFolder={baseFolder}
                        onClick={() => onSelect(clip)}
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
