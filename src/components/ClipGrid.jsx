import ClipCard from "./ClipCard.jsx";
import './clipgrid.css'

function ClipGrid({ clips, baseFolder, onSelect, loading=false }) {
  return (
    <div className="clip-grid">
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
