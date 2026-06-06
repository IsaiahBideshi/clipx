import ClipCard from "./ClipCard.jsx";
import './clipgrid.css'

import { useEffect, useRef, useState } from "react";

function ClipGrid({ clips, baseFolder, onSelect, loading=false }) {
  const GAP = 20;
  const containerRef = useRef(null);
  const [fillerCount, setFillerCount] = useState(0);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const firstCard = containerRef.current.querySelector(".clip-card:not(.filler)");
      if (!firstCard) return;
      const cardWidth = firstCard.offsetWidth;
      const containerWidth = containerRef.current.offsetWidth;
      const perRow = Math.round((containerWidth + GAP) / (cardWidth + GAP));
      const remainder = clips.length % perRow;
      setFillerCount(remainder === 0 ? 0 : perRow - remainder);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [clips.length]);

  return (
    <div className="clip-grid" ref={containerRef}>
      {loading ? (
        Array.from({ length: 16 }).map((_, index) => (
              <ClipCardSkeleton key={`clip-skeleton-${index}`} />
            ))
      ) : (
        clips.map((clip) => (
          <ClipCard
            id={clip.id}
            clip={clip}
            onClick={() => onSelect(clip)}
          />

      )))}
      {Array.from({ length: fillerCount }).map((_, i) => (
        <div key={`filler-${i}`} className="clip-card filler" />
      ))}
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
