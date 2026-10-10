// `src/components/NavBar.jsx`
import './navbar.css';

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useAuthSession } from "../lib/authSession.js";
import { getAccountInitials, loadAccountData } from "../lib/accountApi.js";
import { fetchLocalOptions } from "../lib/localOptions.js";

import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import FolderIcon from '@mui/icons-material/Folder';
import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

const CLIP_TABS = [
  { path: "/", label: "Local Files", Icon: FolderIcon },
  { path: "/library", label: "Library", Icon: VideoLibraryIcon },
];

export default function NavBar({ showUpdateButton = true, updateStatus = null, updateErrorMessage = null, onUpdateClick }) {
  const isDownloading = updateStatus === "downloading";
  const { pathname } = useLocation();
  const { data: options } = useQuery({
    queryKey: ["localFiles", "options"],
    queryFn: fetchLocalOptions,
    staleTime: 10 * 60 * 1000,
  });
  const rootPath = String(options?.clipsFolder || "").replace(/[\\/]+$/, "");
  const [newClips, setNewClips] = useState({ "/": 0, "/library": 0 });

  function clearNewClips(path) {
    setNewClips((counts) => (counts[path] ? { ...counts, [path]: 0 } : counts));
  }

  useEffect(() => {
    clearNewClips(pathname);

    function addNewClip(path) {
      if (pathname !== path || !document.hasFocus()) {
        setNewClips((counts) => ({ ...counts, [path]: counts[path] + 1 }));
      }
    }

    const handleClipUploaded = () => addNewClip("/library");
    window.addEventListener("clipx:clip-uploaded", handleClipUploaded);
    const unsubscribe = window.clipx?.onLocalClipIndexChanged?.((event) => {
      if (event?.type === "added" && event.rootPath === rootPath) {
        addNewClip("/");
      }
    });

    return () => {
      window.removeEventListener("clipx:clip-uploaded", handleClipUploaded);
      unsubscribe?.();
    };
  }, [pathname, rootPath]);

  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: account } = useQuery({
    queryKey: ["profile", "account", userId],
    queryFn: () => loadAccountData(session, userId),
    enabled: Boolean(session && userId),
  });

  return (
    <nav className="nav-bar" aria-label="Main">
      <div className="left-nav-bar">
        {CLIP_TABS.map(({ path, label, Icon }) => {
          const count = newClips[path];
          const title = count ? `${label} (${count} new)` : label;

          return (
            <NavLink key={path} to={path} className="nav-link" aria-label={title} title={title} onClick={() => clearNewClips(path)}>
              <Icon fontSize="small" />
              <span className="nav-link__label">{label}</span>
              {count > 0 && <span className="nav-badge">{count > 99 ? "99+" : count}</span>}
            </NavLink>
          );
        })}
      </div>

      <div className="right-nav-bar">
        {showUpdateButton && (
          isDownloading ? (
            <Tooltip title="Downloading update">
              <IconButton
                className="nav-update-button"
                aria-label="Downloading update"
                onClick={onUpdateClick}
              >
                <CircularProgress size={18} color="inherit" />
              </IconButton>
            </Tooltip>
          ) : updateStatus === "downloaded" ? (
            <Button
              className="nav-update-ready"
              aria-label="Restart to update"
              title="Restart to update"
              onClick={onUpdateClick}
              startIcon={<DownloadIcon />}
            >
              <span className="nav-link__label">Restart to update</span>
            </Button>
          ) : updateStatus === "error" ? (
            <Tooltip
              title={updateErrorMessage || "Update failed"}
              componentsProps={{ tooltip: { sx: { color: "red" } } }}
            >
              <IconButton
                className="nav-update-button nav-update-button--error"
                aria-label="Update failed"
                onClick={onUpdateClick}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Update available">
              <IconButton
                className="nav-update-button"
                aria-label="Update available"
                onClick={onUpdateClick}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )
        )}

        <NavLink to="/profile" className="nav-link nav-link--icon" aria-label="Account" title="Account">
          {account ? (
            <span className="account-avatar">
              {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : getAccountInitials(account)}
            </span>
          ) : (
            <AccountCircleIcon fontSize="small" />
          )}
        </NavLink>

        <NavLink to="/settings" className="nav-link nav-link--icon" aria-label="Settings" title="Settings">
          <SettingsIcon fontSize="small" />
        </NavLink>
      </div>
    </nav>
  );
}
