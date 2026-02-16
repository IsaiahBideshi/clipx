import "./savingclipswidget.css";

export default function SavingClipsWidget({ clips, expanded, onToggleExpanded }) {
  if (!clips?.length) return null;

  const savingCount = clips.filter((clip) => clip.status === "saving").length;

  return (
    <div className="saving-clips-widget">
      <button type="button" className="saving-clips-header" onClick={onToggleExpanded}>
        <div className="saving-clips-header-left">
          {savingCount > 0 && <span className="saving-spinner" />}
          <span className="saving-clips-title">
            {savingCount > 0
              ? `Saving ${savingCount} clip${savingCount > 1 ? "s" : ""}`
              : "Recent save updates"}
          </span>
        </div>
        <span className="saving-clips-toggle">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="saving-clips-list">
          {clips.map((clip) => (
            <div key={clip.id} className="saving-clip-item">
              <span className="saving-clip-name">{clip.name}</span>
              <span className={`saving-clip-status ${clip.status === "failed" ? "failed" : ""}`}>
                {clip.status === "failed" ? "failed" : "saving"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
