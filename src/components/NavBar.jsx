// `src/components/NavBar.jsx`
import './navbar.css';

import { Link } from "react-router-dom";

import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import FolderIcon from '@mui/icons-material/Folder';

export default function NavBar({ openSettings }) {
  return (
    <div className="nav-bar">
      <div className="left-nav-bar" onClick={openSettings}>
        <Link to="/" className="nav-icon" aria-label="Settings">
          <FolderIcon fontSize="medium" />
        </Link>

        <Link to="/library" className="nav-icon" aria-label="Library">
          <VideoLibraryIcon fontSize="medium" />
        </Link>
      </div>

      <h2>ClipX</h2>

      <div className="right-nav-bar">
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
