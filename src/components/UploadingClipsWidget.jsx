import "./uploadingclips.css";

export default function UploadingClipsWidget({ clips, expanded, onToggleExpanded }) {
  if (!clips?.length) return null;

  const uploadingCount = clips.filter((clip) => clip.status === "uploading").length;

  async function handleCopyLink(youtubeUrl) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(youtubeUrl);
        return;
      }

      const textArea = document.createElement("textarea");
      textArea.value = youtubeUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    } catch (e) {
      console.error("Failed to copy YouTube link:", e);
    }
  }

  return (
    <div className="uploading-clips-widget">
      <button type="button" className="uploading-clips-header" onClick={onToggleExpanded}>
        <div className="uploading-clips-header-left">
          {uploadingCount > 0 && <span className="uploading-spinner" />}
          <span className="uploading-clips-title">
            {uploadingCount > 0
              ? `Uploading ${uploadingCount} clip${uploadingCount > 1 ? "s" : ""}`
              : "Recent upload updates"}
          </span>
        </div>
        <span className="uploading-clips-toggle">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="uploading-clips-list">
          {clips.map((clip) => (
            <div key={clip.id} className="uploading-clip-item">
              <div className="uploading-clip-main">
                <span className="uploading-clip-name">{clip.name}</span>
                {clip.status === "uploaded" && clip.youtubeUrl && (
                  <button
                    type="button"
                    className="uploading-clip-link"
                    onClick={() => handleCopyLink(clip.youtubeUrl)}
                  >
                    Copy Link
                  </button>
                )}
              </div>
              <span className={`uploading-clip-status ${clip.status === "failed" ? "failed" : ""}`}>
                {clip.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
