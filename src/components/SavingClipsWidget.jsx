import "./widgets.css";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export default function SavingClipsWidget({ clips, expanded, onToggleExpanded, onDismiss }) {
  if (!clips?.length) return null;

  const savingCount = clips.filter((clip) => clip.status === "saving").length;

  return (
    <div className="saving-clips-widget">
      <div className="saving-clips-header" onClick={onToggleExpanded}>
        <button type="button" className="saving-clips-header-toggle">
          <span className="saving-clips-header-left">
            {savingCount > 0 && <span className="saving-spinner" />}
            <span className="saving-clips-title">
              {savingCount > 0
                ? `Saving ${savingCount} clip${savingCount > 1 ? "s" : ""}`
                : "Recent save updates"}
            </span>
          </span>
        </button>
        <div className="saving-clips-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="saving-clips-action"
            aria-label={expanded ? "Minimize" : "Expand"}
            onClick={onToggleExpanded}
          >
            {expanded ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </button>
          <button
            type="button"
            className="saving-clips-action"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="saving-clips-list">
          {clips.map((clip) => (
            <div key={clip.id} className="saving-clip-item">
              <span className="saving-clip-name">{clip.name}</span>
              <span className={`saving-clip-status ${clip.status === "failed" ? "failed" : ""}`}>
                {clip.status}
                {clip.status === "failed" && (
                  <span>{clip.error ? ` — ${clip.error}` : ""}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
