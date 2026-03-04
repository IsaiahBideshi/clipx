import ClipCard from "./ClipCard.jsx";
import './clipgrid.css'

function ClipGrid({ clips, baseFolder, onSelect}) {
  return (
    <div className="clip-grid">
      {clips.map((clip) => (
        <ClipCard
          id={clip.id}
          clip={clip}
          onClick={() => onSelect(clip)}
        />
      ))}
    </div>
  );
}

export default ClipGrid;
