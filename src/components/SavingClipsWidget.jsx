import "./widgets.css";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";

export default function SavingClipsWidget({ clips, expanded, onToggleExpanded, onDismiss }) {
  if (!clips?.length) return null;

  const savingCount = clips.filter((clip) => clip.status === "saving").length;

  return (
    <div className="clip-widget">
      <div className="clip-widget-header">
        <button type="button" className="clip-widget-toggle" aria-expanded={expanded} onClick={onToggleExpanded}>
          <span className="clip-widget-badge">
            {savingCount > 0 ? <span className="clip-widget-spinner" /> : <SaveOutlinedIcon />}
          </span>
          <span className="clip-widget-title">
            {savingCount > 0
              ? `Saving ${savingCount} clip${savingCount > 1 ? "s" : ""}`
              : "Recent saves"}
          </span>
          {expanded ? <ExpandMoreIcon className="clip-widget-chevron" /> : <ExpandLessIcon className="clip-widget-chevron" />}
        </button>
        {savingCount === 0 && (
          <button type="button" className="clip-widget-action" aria-label="Dismiss" onClick={onDismiss}>
            <CloseIcon />
          </button>
        )}
      </div>

      {expanded && (
        <ul className="clip-widget-list">
          {clips.map((clip) => (
            <li key={clip.id} className="clip-widget-item">
              <span className={`clip-widget-status ${clip.status}`}>
                {clip.status === "saving" && <span className="clip-widget-spinner" />}
                {clip.status === "saved" && <CheckIcon />}
                {clip.status === "failed" && <ErrorOutlineIcon />}
              </span>
              <div className="clip-widget-item-body">
                <span className="clip-widget-item-name">{clip.name}</span>
                {clip.status === "saving" && (
                  <>
                    <span className="clip-widget-item-detail">Saving…</span>
                    <span className="clip-widget-progress" />
                  </>
                )}
                {clip.status === "saved" && (
                  <span className="clip-widget-item-detail">Saved to your Saved Clips</span>
                )}
                {clip.status === "failed" && (
                  <span className="clip-widget-item-detail failed">{clip.error || "Save failed."}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
