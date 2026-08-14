// `src/components/NavBar.jsx`
import './navbar.css';

import { Link } from "react-router-dom";

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
    <div className="nav-bar">
      <div className="left-nav-bar">
        <Link to="/" className="nav-icon" aria-label="Local Files" title="Local Files">
          <FolderIcon fontSize="medium" />
        </Link>

        <Link to="/library" className="nav-icon" aria-label="Library" title="Library">
          <VideoLibraryIcon fontSize="medium" />
        </Link>
      </div>

      <h2 className="nav-bar__app-name">ClipX</h2>

      <div className="right-nav-bar">
        {showUpdateButton && (
          isDownloading ? (
            <Tooltip title="Downloading update">
              <IconButton
                className="nav-icon nav-update-button"
                aria-label="Downloading update"
                onClick={onUpdateClick}
                size="medium"
              >
                <CircularProgress size={18} color="inherit" />
              </IconButton>
            </Tooltip>
          ) : updateStatus === "downloaded" ? (
            <Tooltip title="Update ready!" className="nav-icon">
              <Button
                className="nav-update-ready"
                aria-label="Update ready"
                onClick={onUpdateClick}
                startIcon={<DownloadIcon />}
              />
            </Tooltip>
          ) : updateStatus === "error" ? (
            <Tooltip
              title={updateErrorMessage || "Update failed"}
              componentsProps={{ tooltip: { sx: { color: "red" } } }}
            >
              <IconButton
                className="nav-icon nav-update-button"
                aria-label="Update failed"
                onClick={onUpdateClick}
                size="medium"
              >
                <DownloadIcon fontSize="medium" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Update available">
              <IconButton
                className="nav-icon nav-update-button"
                aria-label="Update available"
                onClick={onUpdateClick}
                size="medium"
              >
                <DownloadIcon fontSize="medium" />
              </IconButton>
            </Tooltip>
          )
        )}

        <Link to={"/profile"} className="nav-icon" aria-label="Account" title="Account">
          <AccountCircleIcon fontSize="medium" />
        </Link>

        <Link to="/settings" className="nav-icon" aria-label="Settings" title="Settings">
          <SettingsIcon fontSize="medium" />
        </Link>
      </div>
    </div>
  );
}
