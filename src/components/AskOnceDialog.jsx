import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { fetchLocalOptions } from "../lib/localOptions.js";
import { useBackdropClose, useEscapeKey } from "../lib/modalClose.js";
import "./clipgrid.css";

export function useAskOnce() {
  const [question, setQuestion] = useState(null);
  const queryClient = useQueryClient();

  async function ask(optionKey, prompt) {
    const options = (await fetchLocalOptions()) || {};
    if (typeof options[optionKey] === "boolean") {
      return options[optionKey];
    }

    return new Promise((resolve) => setQuestion({ optionKey, prompt, resolve }));
  }

  async function answer(value, dontAskAgain) {
    const { optionKey, resolve } = question;
    setQuestion(null);
    resolve(value);
    if (!dontAskAgain || value === null) return;

    try {
      const options = { ...(await fetchLocalOptions()), [optionKey]: value };
      await window.clipx.saveOptions(options);
      queryClient.setQueryData(["localFiles", "options"], options);
    } catch (err) {
      console.error(`Failed to save the ${optionKey} option:`, err);
    }
  }

  return {
    ask,
    dialog: question && <AskOnceDialog {...question.prompt} onAnswer={answer} />,
  };
}

function AskOnceDialog({ message, yesText = "Yes", noText = "No", onAnswer }) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const dismiss = () => onAnswer(null);
  useEscapeKey(dismiss, true);
  const backdropProps = useBackdropClose(dismiss, true);

  return createPortal(
    <div className="delete-modal" {...backdropProps}>
      <div className="delete-modal-content" role="dialog" aria-modal="true">
        <div className="delete-modal-message">{message}</div>
        <FormControlLabel
          sx={{ display: "flex", justifyContent: "center", margin: "12px 0 0" }}
          control={<Checkbox size="small" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} />}
          label="Don't ask again"
        />
        <div style={{ display: "flex", marginLeft: "auto", marginRight: "auto", marginTop: "12px", width: "fit-content", gap: "12px" }}>
          <button className="cancel-button" onClick={() => onAnswer(false, dontAskAgain)}>{noText}</button>
          <button className="rename-button" onClick={() => onAnswer(true, dontAskAgain)}>{yesText}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
