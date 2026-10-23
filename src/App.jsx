import './App.css';
import ErrorFallback from "./components/errorfallback.jsx";
import LocalFiles from './pages/LocalFiles.jsx';
import Settings from './pages/Settings.jsx';

import {useState, useEffect} from 'react';
import {Routes, Route} from "react-router-dom";
import {ErrorBoundary} from "react-error-boundary";
import {useQueryClient} from "@tanstack/react-query";

import Library from "./pages/Library.jsx";
import Profile from "./pages/Profile.jsx";
import Signup from "./pages/signup.jsx";
import Login from "./pages/login.jsx";
import NavBar from "./components/NavBar.jsx";
import MenuBar from "./components/MenuBar.jsx";
import ChangelogModal from "./components/ChangelogModal.jsx";
import SavingClipsWidget from "./components/SavingClipsWidget.jsx";
import UploadingClipsWidget from "./components/UploadingClipsWidget.jsx";
import changelog from "../CHANGELOG.md?raw";
import announcements from "../ANNOUNCEMENTS.md?raw";
import { getNewAnnouncements } from "./lib/announcements.js";

const LAST_SEEN_CHANGELOG_KEY = "clipx:lastSeenChangelogVersion";

const NAV_UPDATE_STATUSES = new Set([
  "available",
  "downloading",
  "downloaded",
  "installing",
  "error",
]);

function hasNavUpdate(updateState) {
  if (!updateState?.update?.version) {
    return false;
  }

  return NAV_UPDATE_STATUSES.has(updateState.status);
}


export default function App() {
  const [updateState, setUpdateState] = useState(null);
  const [updateChangelog, setUpdateChangelog] = useState(null);
  const showUpdateButton = hasNavUpdate(updateState);
  const [savingClips, setSavingClips] = useState([]);
  const [uploadingClips, setUploadingClips] = useState([]);
  const [showSavingList, setShowSavingList] = useState(true);
  const [showUploadingList, setShowUploadingList] = useState(true);
  const savingPaths = savingClips.filter((item) => item.status === "saving").map((item) => item.path);
  const uploadingPaths = uploadingClips.filter((item) => item.status === "uploading").map((item) => item.path);
  const queryClient = useQueryClient();

  function upsertSavingClip(id, nextValues) {
    setSavingClips((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...nextValues } : item))
    );
  }

  function upsertUploadingClip(id, nextValues) {
    setUploadingClips((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...nextValues } : item))
    );
  }

  function handleSaveQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      setSavingClips((prev) => [...prev, { id: event.id, name: event.name || "Untitled Clip", path: event.path, status: "saving" }]);
      return;
    }

    if (event.type === "success") {
      upsertSavingClip(event.id, { status: "saved" });
      return;
    }

    if (event.type === "failed") {
      upsertSavingClip(event.id, { status: "failed", error: event.error });
    }
  }

  function handleUploadQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      setUploadingClips((prev) => [
        ...prev,
        { id: event.id, name: event.name || "Untitled Clip", path: event.path, status: "uploading" },
      ]);
      return;
    }

    if (event.type === "success") {
      upsertUploadingClip(event.id, { status: "uploaded", shareUrl: event.shareUrl });
      queryClient.invalidateQueries({ queryKey: ["library", "newClips"] });
      return;
    }

    if (event.type === "failed") {
      upsertUploadingClip(event.id, { status: "failed", error: event.error });
    }
  }

  async function maybeShowPostUpdateChangelog(version) {
    if (!version) {
      return;
    }

    const lastSeen = await window.clipx?.authStorageGet?.(LAST_SEEN_CHANGELOG_KEY);

    if (lastSeen && lastSeen !== version) {
      setUpdateChangelog({ version, fromVersion: lastSeen });
      return;
    }

    await window.clipx?.authStorageSet?.(LAST_SEEN_CHANGELOG_KEY, version);
  }

  function handleCloseUpdateChangelog() {
    if (updateChangelog?.version) {
      window.clipx?.authStorageSet?.(LAST_SEEN_CHANGELOG_KEY, updateChangelog.version)?.catch((error) => {
        console.error("Failed to save the last seen changelog version:", error);
      });
    }
    setUpdateChangelog(null);
  }

  function handleUpdateClick() {
    if (updateState?.status === "downloaded") {
      window.clipx?.installUpdate?.();
      return;
    }

    if (updateState?.status === "error") {
      window.clipx?.checkForUpdates?.();
    }
  }

  useEffect(() => {
    if (!window.clipx?.onUpdateState) {
      return undefined;
    }

    let mounted = true;
    window.clipx.getUpdateState?.().then((state) => {
      if (mounted) {
        setUpdateState(state);
        return maybeShowPostUpdateChangelog(state?.currentVersion);
      }
    }).catch((err) => {
      console.error("Failed to load update state:", err);
    });

    const unsubscribe = window.clipx.onUpdateState((state) => {
      setUpdateState(state);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <>
      <MenuBar />
      <NavBar
        showUpdateButton={showUpdateButton}
        updateStatus={updateState?.status}
        updateErrorMessage={updateState?.message}
        onUpdateClick={handleUpdateClick}
      />
      <Routes>
        <Route path="/" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <LocalFiles
              onSaveQueueEvent={handleSaveQueueEvent}
              onUploadQueueEvent={handleUploadQueueEvent}
              uploadingPaths={uploadingPaths}
              savingPaths={savingPaths}
            />
          </ErrorBoundary>
        }/>
        <Route path="/settings" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Settings/>
          </ErrorBoundary>
        }/>
        <Route path="/library" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Library/>
          </ErrorBoundary>
        }/>
        <Route path="/profile" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Profile/>
          </ErrorBoundary>
        } />
        <Route path="/signup" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Signup/>
          </ErrorBoundary>
        } />
        <Route path="/login" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Login/>
          </ErrorBoundary>
        } />
      </Routes>
      <div className="clip-widgets">
        <UploadingClipsWidget
          clips={uploadingClips}
          expanded={showUploadingList}
          onToggleExpanded={() => setShowUploadingList((prev) => !prev)}
          onDismiss={() => setUploadingClips([])}
        />
        <SavingClipsWidget
          clips={savingClips}
          expanded={showSavingList}
          onToggleExpanded={() => setShowSavingList((prev) => !prev)}
          onDismiss={() => setSavingClips([])}
        />
      </div>
      {updateChangelog && (
        <ChangelogModal
          changelog={changelog}
          currentVersion={updateChangelog.version}
          fromVersion={updateChangelog.fromVersion}
          announcements={getNewAnnouncements(announcements, updateChangelog.fromVersion, updateChangelog.version)}
          onClose={handleCloseUpdateChangelog}
        />
      )}
    </>
  );
}
