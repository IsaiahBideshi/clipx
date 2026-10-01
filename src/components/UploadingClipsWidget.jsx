import "./widgets.css";
import { useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { copyText } from "../lib/clipboard.js";

export default function UploadingClipsWidget({ clips, expanded, onToggleExpanded, onDismiss }) {
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimeoutRef = useRef(null);

  if (!clips?.length) return null;

  const uploadingCount = clips.filter((clip) => clip.status === "uploading").length;

  async function handleCopyLink(clip) {
    if (!(await copyText(clip.shareUrl))) return;

    setCopiedId(clip.id);
    clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="clip-widget">
      <div className="clip-widget-header">
        <button type="button" className="clip-widget-toggle" aria-expanded={expanded} onClick={onToggleExpanded}>
          <span className="clip-widget-badge">
            {uploadingCount > 0 ? <span className="clip-widget-spinner" /> : <CloudUploadOutlinedIcon />}
          </span>
          <span className="clip-widget-title">
            {uploadingCount > 0
              ? `Uploading ${uploadingCount} clip${uploadingCount > 1 ? "s" : ""}`
              : "Recent uploads"}
          </span>
          {expanded ? <ExpandMoreIcon className="clip-widget-chevron" /> : <ExpandLessIcon className="clip-widget-chevron" />}
        </button>
        {uploadingCount === 0 && (
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
                {clip.status === "uploading" && <span className="clip-widget-spinner" />}
                {clip.status === "uploaded" && <CheckIcon />}
                {clip.status === "failed" && <ErrorOutlineIcon />}
              </span>
              <div className="clip-widget-item-body">
                <span className="clip-widget-item-name">{clip.name}</span>
                {clip.status === "uploading" && (
                  <>
                    <span className="clip-widget-item-detail">Uploading…</span>
                    <span className="clip-widget-progress" />
                  </>
                )}
                {clip.status === "failed" && (
                  <span className="clip-widget-item-detail failed">{clip.error || "Upload failed."}</span>
                )}
                {clip.status === "uploaded" && !clip.shareUrl && (
                  <span className="clip-widget-item-detail">Uploaded. Only public clips get a share link.</span>
                )}
                {clip.status === "uploaded" && clip.shareUrl && (
                  <div className="clip-widget-link">
                    <span className="clip-widget-link-url" title={clip.shareUrl}>
                      {clip.shareUrl.replace(/^https?:\/\//, "")}
                    </span>
                    <button
                      type="button"
                      className={`clip-widget-copy ${copiedId === clip.id ? "copied" : ""}`}
                      onClick={() => handleCopyLink(clip)}
                    >
                      {copiedId === clip.id ? <CheckIcon /> : <ContentCopyIcon />}
                      {copiedId === clip.id ? "Copied" : "Copy link"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
