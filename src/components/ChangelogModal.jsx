import Button from "@mui/material/Button";
import ChangelogPanel from "./ChangelogPanel.jsx";
import "./updatemodal.css";

export default function ChangelogModal({ changelog, currentVersion, onClose }) {
  return (
    <div className="update-modal-backdrop" role="presentation">
      <section className="update-modal" role="dialog" aria-modal="true" aria-labelledby="changelog-modal-title">
        <h2 id="changelog-modal-title">Changelog</h2>
        <ChangelogPanel changelog={changelog} highlightedVersion={currentVersion} highlightedLabel="Current version" />
        <div className="update-modal-actions">
          <Button variant="contained" onClick={onClose}>Close</Button>
        </div>
      </section>
    </div>
  );
}
