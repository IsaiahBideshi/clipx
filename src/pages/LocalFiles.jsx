import '../App.css';
import './localfiles.css';
import ClipGrid from '../components/ClipGrid.jsx';
import ClipEditor from '../components/ClipEditor.jsx';
import SavingClipsWidget from "../components/SavingClipsWidget.jsx";
import UploadingClipsWidget from "../components/UploadingClipsWidget.jsx";
import Settings from './Settings.jsx';
import {useState, useEffect} from 'react';
import Button from '@mui/material/Button';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import {Switch} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';

import { auth } from '../lib/supabase.js';

import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";



export default function LocalFiles() {
  const [folderPath, setFolderPath] = useState();
  const [showSavedFiles, setShowSavedFiles] = useState(false);
  const [files, setFiles] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [options, setOptions] = useState(null);

  const [clip, setClip] = useState(null);
  const [savingClips, setSavingClips] = useState([]);
  const [uploadingClips, setUploadingClips] = useState([]);
  const [showSavingList, setShowSavingList] = useState(true);
  const [showUploadingList, setShowUploadingList] = useState(true);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!window.clipx?.getOptions) {
        console.error("window.clipx.getOptions is not available (preload not wired?)");
        return;
      }
      const tempOpt = await window.clipx.getOptions();
      setOptions(tempOpt);
      if (!cancelled) {
        if (showSavedFiles) {
          setFolderPath(`${tempOpt.clipsFolder}\\ClipX Videos`)
          console.log(`${tempOpt.clipsFolder}\\ClipX Videos`);
        }
        else setFolderPath(tempOpt.clipsFolder);
      }

      if (!folderPath) {
        setFiles([]);
        return;
      }
      if (!window.clipx?.scanFolder) {
        console.error("window.clipx.scanFolder is not available (preload not wired?)");
        return;
      }

      try {
        const list = await window.clipx.scanFolder(folderPath);
        if (!cancelled) setFiles(list);
      } catch (err) {
        console.error("Failed to scan folder:", err);
        if (!cancelled) setFiles([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [folderPath, refreshTick, showSavedFiles]);

  // Keyboard controls
  useEffect(() => {
    function onKeyDown(e) {
      if (e.code === "Escape") {
        setClip(null);
      }
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);



  const refreshFiles = () => {
    setRefreshTick((tick) => tick + 1);
  };

  function upsertSavingClip(id, nextValues) {
    setSavingClips((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...nextValues } : item))
    );
  }

  function removeSavingClip(id) {
    setSavingClips((prev) => prev.filter((item) => item.id !== id));
  }

  function upsertUploadingClip(id, nextValues) {
    setUploadingClips((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...nextValues } : item))
    );
  }

  function removeUploadingClip(id) {
    setUploadingClips((prev) => prev.filter((item) => item.id !== id));
  }

  function handleSaveQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      setSavingClips((prev) => [...prev, { id: event.id, name: event.name || "Untitled Clip", status: "saving" }]);
      return;
    }

    if (event.type === "success") {
      removeSavingClip(event.id);
      return;
    }

    if (event.type === "failed") {
      upsertSavingClip(event.id, { status: "failed" });
      setTimeout(() => removeSavingClip(event.id), 5000);
    }
  }

  function handleUploadQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      setUploadingClips((prev) => [
        ...prev,
        { id: event.id, name: event.name || "Untitled Clip", status: "uploading" }
      ]);
      return;
    }

    if (event.type === "success") {
      upsertUploadingClip(event.id, {
        status: "uploaded",
        youtubeUrl: event.youtubeUrl,
        videoId: event.videoId,
      });
      setTimeout(() => removeUploadingClip(event.id), 15000);
      return;
    }

    if (event.type === "failed") {
      upsertUploadingClip(event.id, { status: "failed" });
      setTimeout(() => removeUploadingClip(event.id), 7000);
    }
  }

  return (
    <OverlayScrollbarsComponent
      className="local-files-page"
      defer
      options={{ scrollbars: { autoHide: 'scroll', theme: 'os-theme-dark' } }}
    >
      {options && (
        <>
          <span className="local-files-toggle-label">Saved Clips</span>
          <Switch
            className="local-files-toggle"
            defaultChecked={false}
            onChange={(e) => setShowSavedFiles(e.target.checked)}
          />
        </>
      )}

      {folderPath && <pre className="local-files-path">Folder: {folderPath}</pre>}
      <RefreshIcon
        className="local-files-refresh"
        fontSize={"large"}
        sx={{ cursor: "pointer" }}
        onClick={refreshFiles}
      />

      {clip && (
        <>
          <ClipEditor
            clip={clip}
            onSaveQueueEvent={handleSaveQueueEvent}
            onUploadQueueEvent={handleUploadQueueEvent}
            isSavedClipsView={showSavedFiles}
            onClose={() => setClip(null)}
          />
        </>
      )}
      {!!files.length ? (
        <ClipGrid clips={files} baseFolder={folderPath} onSelect={(clip) => {
          console.log("Selected clip:", clip);
          setClip(clip);
        }} />
      ) : (
        <ClipGrid clips={[]} baseFolder={folderPath} loading={loading} />
      )}
      {!files.length && (
        <p className="local-files-empty">No clips found in the selected folder.</p>
      )}
      <SavingClipsWidget
        clips={savingClips}
        expanded={showSavingList}
        onToggleExpanded={() => setShowSavingList((prev) => !prev)}
      />
      <UploadingClipsWidget
        clips={uploadingClips}
        expanded={showUploadingList}
        onToggleExpanded={() => setShowUploadingList((prev) => !prev)}
      />
    </OverlayScrollbarsComponent>
  );
}
