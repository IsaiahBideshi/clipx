import "./notifications.css";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Popover from "@mui/material/Popover";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { copyText } from "../lib/clipboard.js";
import { getAccountInitials } from "../lib/accountApi.js";
import { useNotifications } from "../lib/notifications.js";
import { getNotificationContent } from "../lib/notificationItems.js";
import { formatDate } from "./ClipCard.jsx";

function isRunning(item) {
  return item.status === "saving" || item.status === "uploading";
}

export default function NotificationsMenu({ session, localItems, setLocalItems }) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimeoutRef = useRef(null);
  const { notifications, unseenCount, markSeen, dismiss, dismissAll, respond } = useNotifications(session);

  const running = localItems.some(isRunning);
  const unseen = unseenCount + localItems.filter((item) => !isRunning(item) && !item.seen).length;
  const items = [
    ...localItems.map((item) => ({ ...item, key: `${item.kind}:${item.id}`, time: item.createdAt })),
    ...notifications.map((item) => ({ ...item, kind: "notification", key: item.id, time: item.created_at })),
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const canClear = notifications.some((item) => item.type !== "friend_request") || localItems.some((item) => !isRunning(item));
  const title = unseen ? `Notifications (${unseen} new)` : "Notifications";

  function markAllSeen() {
    markSeen();
    setLocalItems((prev) => (prev.some((item) => !isRunning(item) && !item.seen)
      ? prev.map((item) => (isRunning(item) ? item : { ...item, seen: true }))
      : prev));
  }

  function handleOpen(event) {
    setAnchor(event.currentTarget);
    markAllSeen();
  }

  function handleClose() {
    setAnchor(null);
    markAllSeen();
  }

  function dismissLocal(key) {
    setLocalItems((prev) => prev.filter((item) => `${item.kind}:${item.id}` !== key));
  }

  function handleClearAll() {
    setLocalItems((prev) => prev.filter(isRunning));
    dismissAll();
  }

  function handleOpenNotification(notification, content) {
    handleClose();
    navigate(content.link);
    if (notification.type !== "friend_request") {
      dismiss(notification.id);
    }
  }

  async function handleCopyLink(item) {
    if (!(await copyText(item.shareUrl))) return;

    setCopiedId(item.key);
    clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
  }

  function renderDismiss(onClick) {
    return (
      <button type="button" className="notification-icon-button" aria-label="Dismiss" title="Dismiss" onClick={onClick}>
        <CloseIcon />
      </button>
    );
  }

  function renderNotification(item) {
    const content = getNotificationContent(item);
    const Main = content.link ? "button" : "div";

    return (
      <li key={item.key} className={`notification-item${content.link ? " is-link" : ""}`}>
        <Main
          {...(content.link ? { type: "button", onClick: () => handleOpenNotification(item, content) } : {})}
          className="notification-main"
        >
          <span className="account-avatar notification-avatar" aria-hidden="true">
            {item.actor?.avatar_url ? <img src={item.actor.avatar_url} alt="" /> : getAccountInitials(item.actor)}
          </span>
          <span className="notification-body">
            <span className="notification-text">
              {content.before}<strong>{content.name}</strong>{content.after}
            </span>
            <span className="notification-detail">
              {content.linkLabel && <span className="notification-link-label">{content.linkLabel} · </span>}
              {formatDate(item.created_at)}
            </span>
          </span>
        </Main>
        <div className="notification-actions">
          {item.type === "friend_request" ? (
            <>
              <button type="button" className="notification-icon-button accept" aria-label="Accept" title="Accept" onClick={() => respond(item, true)}>
                <CheckIcon />
              </button>
              <button type="button" className="notification-icon-button decline" aria-label="Decline" title="Decline" onClick={() => respond(item, false)}>
                <CloseIcon />
              </button>
            </>
          ) : renderDismiss(() => dismiss(item.id))}
        </div>
      </li>
    );
  }

  function renderLocalItem(item) {
    const failedText = item.error || (item.kind === "save" ? "Save failed." : "Upload failed.");
    let detail = null;
    if (item.status === "failed") {
      detail = <span className="notification-detail failed" title={failedText}>{failedText}</span>;
    } else if (item.status === "saved") {
      detail = <span className="notification-detail">Saved to your Saved Clips</span>;
    } else if (item.status === "uploaded") {
      const text = item.shareUrl ? "Uploaded!" : "Uploaded. Only public clips get a share link.";
      detail = <span className="notification-detail" title={text}>{text}</span>;
    }

    return (
      <li key={item.key} className="notification-item">
        <div className="notification-main">
          <span className={`notification-status ${item.status}`}>
            {isRunning(item) && <span className="notification-spinner" />}
            {(item.status === "saved" || item.status === "uploaded") && <CheckIcon />}
            {item.status === "failed" && <ErrorOutlineIcon />}
          </span>
          <span className="notification-body">
            <span className="notification-text notification-name">
              {isRunning(item) && (item.kind === "save" ? "Saving " : "Uploading ")}
              <strong>{item.name}</strong>
            </span>
            {isRunning(item) ? <span className="notification-progress" /> : detail}
          </span>
        </div>
        {!isRunning(item) && (
          <div className="notification-actions">
            {item.status === "uploaded" && item.shareUrl && (
              <button
                type="button"
                className={`notification-copy ${copiedId === item.key ? "copied" : ""}`}
                onClick={() => handleCopyLink(item)}
              >
                {copiedId === item.key ? <CheckIcon /> : <ContentCopyIcon />}
                {copiedId === item.key ? "Copied" : "Copy link"}
              </button>
            )}
            {renderDismiss(() => dismissLocal(item.key))}
          </div>
        )}
      </li>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`nav-link nav-link--icon nav-notifications${anchor ? " active" : ""}${running ? " is-running" : ""}`}
        aria-label={title}
        title={title}
        onClick={anchor ? handleClose : handleOpen}
      >
        <span className="nav-notifications-icon">
          <NotificationsNoneIcon fontSize="small" />
          {running && <span className="nav-notifications-ring" />}
          {unseen > 0 && <span className="nav-notifications-badge">{unseen > 99 ? "99+" : unseen}</span>}
        </span>
      </button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { className: "notifications-panel" } }}
      >
        <div className="notifications-header">
          <span className="notifications-title">Notifications</span>
          {canClear && (
            <button type="button" className="notifications-clear" onClick={handleClearAll}>
              Clear all
            </button>
          )}
        </div>
        {items.length ? (
          <ul className="notifications-list">
            {items.map((item) => (item.kind === "notification" ? renderNotification(item) : renderLocalItem(item)))}
          </ul>
        ) : (
          <p className="notifications-empty">You're all caught up.</p>
        )}
      </Popover>
    </>
  );
}
