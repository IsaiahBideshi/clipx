import './App.css';
import ErrorFallback from "./components/errorfallback.jsx";
import LocalFiles from './pages/LocalFiles.jsx';
import Settings from './pages/Settings.jsx';

import {useState, useEffect} from 'react';
import {Routes, Route} from "react-router-dom";
import {ErrorBoundary} from "react-error-boundary";

import Library from "./pages/Library.jsx";
import Profile from "./pages/Profile.jsx";
import Signup from "./pages/signup.jsx";
import Login from "./pages/login.jsx";
import NavBar from "./components/NavBar.jsx";
import MenuBar from "./components/MenuBar.jsx";

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
  const showUpdateButton = hasNavUpdate(updateState);

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
            <LocalFiles/>
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
    </>
  );
}
