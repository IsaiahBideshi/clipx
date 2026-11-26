import './App.css';
import ErrorFallback from "./components/errorfallback.jsx";
import LocalFiles from './pages/LocalFiles.jsx';
import Settings from './pages/Settings.jsx';
import Recording from './pages/Recording.jsx';

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
  const [localNotifications, setLocalNotifications] = useState([]);
  const savingPaths = localNotifications.filter((item) => item.status === "saving").map((item) => item.path);
  const uploadingPaths = localNotifications.filter((item) => item.status === "uploading").map((item) => item.path);
  const queryClient = useQueryClient();

  useEffect(() => {
    return window.clipx?.onLocalClipIndexChanged?.((event) => {
      if (event?.type === "added" || event?.type === "updated" || event?.type === "removed") {
        queryClient.invalidateQueries({ queryKey: ["localFiles", "clips"] });
      }
    });
  }, [queryClient]);

  function addLocalNotification(kind, event, status) {
    setLocalNotifications((prev) => [
      ...prev,
      { id: event.id, kind, name: event.name || "Untitled Clip", path: event.path, status, createdAt: new Date().toISOString() },
    ]);
  }

  function upsertLocalNotification(kind, id, nextValues) {
    setLocalNotifications((prev) =>
      prev.map((item) => (item.kind === kind && item.id === id ? { ...item, ...nextValues, seen: false } : item))
    );
  }

  function handleSaveQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      addLocalNotification("save", event, "saving");
      return;
    }

    if (event.type === "success") {
      upsertLocalNotification("save", event.id, { status: "saved" });
      return;
    }

    if (event.type === "failed") {
      upsertLocalNotification("save", event.id, { status: "failed", error: event.error });
    }
  }

  function handleUploadQueueEvent(event) {
    if (!event?.id) return;

    if (event.type === "started") {
      addLocalNotification("upload", event, "uploading");
      return;
    }

    if (event.type === "success") {
      upsertLocalNotification("upload", event.id, { status: "uploaded", shareUrl: event.shareUrl });
      queryClient.invalidateQueries({ queryKey: ["library", "newClips"] });
      queryClient.invalidateQueries({ queryKey: ["library", "clips", "uploadedGames"] });
      return;
    }

    if (event.type === "failed") {
      upsertLocalNotification("upload", event.id, { status: "failed", error: event.error });
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
        localNotifications={localNotifications}
        setLocalNotifications={setLocalNotifications}
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
        <Route path="/recording" element={
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Recording/>
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
