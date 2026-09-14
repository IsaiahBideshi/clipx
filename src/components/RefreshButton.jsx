import { useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import "./refreshbutton.css";

const SPIN_MS = 600;

export default function RefreshButton({ onRefresh, fontSize = "large", className = "" }) {
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    if (spinning) return;
    setSpinning(true);
    onRefresh?.();
    window.setTimeout(() => setSpinning(false), SPIN_MS);
  }

  return (
    <span
      className={`refresh-button${spinning ? " spinning" : ""}${className ? ` ${className}` : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Refresh"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <span className="refresh-button-spinner">
        <RefreshIcon fontSize={fontSize} />
      </span>
    </span>
  );
}