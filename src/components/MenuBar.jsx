import './menubar.css';

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const MinimizeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="1.5" y="3" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3.5 3.5 V2.5 A1 1 0 0 1 4.5 1.5 H9.5 A1 1 0 0 1 10.5 2.5 V7.5 A1 1 0 0 1 9.5 8.5 H8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export default function MenuBar() {
  const [openMenu, setOpenMenu] = useState(null);
  const [windowState, setWindowState] = useState({
    maximized: false,
    fullscreen: false,
  });
  const menuBarRef = useRef(null);

  useEffect(() => {
    if (!window.clipx?.windowControls) {
      return undefined;
    }

    let mounted = true;
    window.clipx.windowControls.getState().then((state) => {
      if (mounted) {
        setWindowState(state);
      }
    }).catch((error) => {
      console.error("ClipX: Failed to load window state:", error);
    });

    const unsubscribe = window.clipx.windowControls.onStateChanged((state) => {
      setWindowState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);


  const handleDragRegionDoubleClick = () => {
    if (!windowState.fullscreen) {
      window.clipx?.windowControls?.toggleMaximize();
    }
  };


  return (
    <div className="menu-bar" ref={menuBarRef}>
      <div
        className="drag-region"
        onDoubleClick={handleDragRegionDoubleClick}
        aria-hidden="true"
      />

      <div className="menu-items" role="menubar" aria-label="Application menu">
        <Link to="/" className="menu-item" aria-label="ClipX home" title="Home">
          <img src="assets/clipx_icon.svg" alt="ClipX" className="app-icon" />
          <span className="app-name">ClipX</span>
        </Link>
      </div>

      {!windowState.fullscreen && (
        <div className="window-controls">
          <button
            type="button"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => window.clipx?.windowControls?.minimize()}
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            aria-label={windowState.maximized ? "Restore" : "Maximize"}
            title={windowState.maximized ? "Restore" : "Maximize"}
            onClick={() => window.clipx?.windowControls?.toggleMaximize()}
          >
            {windowState.maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            className="close-btn"
            aria-label="Close"
            title="Close"
            onClick={() => window.clipx?.windowControls?.close()}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
