import ClipCard from "./ClipCard.jsx";
import './clipgrid.css'

function ClipGrid({ clips, baseFolder, onSelect }) {
  return (
    <div className="clip-grid">
      {clips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          onClick={() => onSelect(clip)}
        />
      ))}
    </div>
  );
}

export default ClipGrid;
