// `src/components/NavBar.jsx`
import './navbar.css';

import { NavLink } from "react-router-dom";

import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import FolderIcon from '@mui/icons-material/Folder';
import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

export default function NavBar({ showUpdateButton = true, updateStatus = null, updateErrorMessage = null, onUpdateClick }) {
  const isDownloading = updateStatus === "downloading";

  return (
    <nav className="nav-bar" aria-label="Main">
      <div className="left-nav-bar">
        <NavLink to="/" className="nav-link">
          <FolderIcon fontSize="small" />
          Local Files
        </NavLink>

        <NavLink to="/library" className="nav-link">
          <VideoLibraryIcon fontSize="small" />
          Library
        </NavLink>
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
              onClick={onUpdateClick}
              startIcon={<DownloadIcon />}
            >
              Restart to update
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
          <AccountCircleIcon fontSize="small" />
        </NavLink>

        <NavLink to="/settings" className="nav-link nav-link--icon" aria-label="Settings" title="Settings">
          <SettingsIcon fontSize="small" />
        </NavLink>
      </div>
    </nav>
  );
}
