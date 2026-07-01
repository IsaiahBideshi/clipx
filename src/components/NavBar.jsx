// `src/components/NavBar.jsx`
import './navbar.css';

import { Link } from "react-router-dom";

import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import FolderIcon from '@mui/icons-material/Folder';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

export default function NavBar({ showUpdateButton = false, onUpdateClick }) {
  return (
    <div className="nav-bar">
      <div className="left-nav-bar">
        <Link to="/" className="nav-icon" aria-label="Settings">
          <FolderIcon fontSize="medium" />
        </Link>

        <Link to="/library" className="nav-icon" aria-label="Library">
          <VideoLibraryIcon fontSize="medium" />
        </Link>
      </div>

      <h2>ClipX</h2>

      <div className="right-nav-bar">
        {showUpdateButton && (
          <Tooltip title="Update available">
            <IconButton
              className="nav-icon nav-update-button"
              aria-label="Update available"
              onClick={onUpdateClick}
              size="medium"
            >
              <FileDownloadOutlinedIcon fontSize="medium" />
            </IconButton>
          </Tooltip>
        )}

        <Link to={"/profile"} className="nav-icon" aria-label="Account">
          <AccountCircleIcon fontSize="medium" />
        </Link>

        <Link to="/settings" className="nav-icon" aria-label="Settings">
          <SettingsIcon fontSize="medium" />
        </Link>
      </div>
    </div>
  );
}
