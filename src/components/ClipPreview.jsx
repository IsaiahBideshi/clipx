import "./clippreview.css";

import Slider from '@mui/material/Slider';

export default function ClipPreview({ clip, onClose }) {
  if (!clip) return null;

  return (
    <div className="clip-preview-container" onClick={onClose}>
      <div className="clip-preview-content" onClick={(e) => e.stopPropagation()}>
        <video controls autoPlay>
          <source src={clip.path} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}
