import './App.css';
import ClipGrid from './components/ClipGrid.jsx';
import ClipEditor from './components/ClipEditor.jsx';
import ErrorFallback from "./components/errorfallback.jsx";
import LocalFiles from './pages/LocalFiles.jsx';
import Settings from './pages/Settings.jsx';

import {useState, useEffect} from 'react';
import {HashRouter as Router, Routes, Route} from "react-router-dom";
import {ErrorBoundary} from "react-error-boundary";

import Button from '@mui/material/Button';
import SettingsIcon from '@mui/icons-material/Settings';
import Library from "./pages/Library.jsx";
import Profile from "./pages/Profile.jsx";

export default function App() {
  return (
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
      </Routes>
  );
}
