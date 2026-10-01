import { useEffect, useRef, useState } from "react";
import Tooltip from "@mui/material/Tooltip";
import LinkIcon from "@mui/icons-material/Link";
import CheckIcon from "@mui/icons-material/Check";
import { copyText } from "../lib/clipboard.js";

export default function CopyLinkButton({ url, className }) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

  async function handleClick(e) {
    e.stopPropagation();
    if (!(await copyText(url))) return;

    setCopied(true);
    clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Tooltip title={copied ? "Copied!" : "Copy link"}>
      <button type="button" className={className} aria-label="Copy link" onClick={handleClick}>
        {copied ? <CheckIcon /> : <LinkIcon />}
      </button>
    </Tooltip>
  );
}
