import '../App.css';
import ClipGrid from '../components/ClipGrid.jsx';
import ClipEditor from '../components/ClipEditor.jsx';
import Settings from './Settings.jsx';
import {useState, useEffect} from 'react';
import Button from '@mui/material/Button';
import SettingsIcon from '@mui/icons-material/Settings';



export default function LocalFiles() {
  const [folderPath, setFolderPath] = useState("D:\\Clips");
  const [files, setFiles] = useState([]);

  const [clip, setClip] = useState(null);

  console.log(files);

  useEffect(() => {
    let cancelled = false;

    async function run() {
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
  }, [folderPath]);

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

  const pickFolder = async () => {
    try {
      if (!window.clipx?.pickFolder) {
        console.error("window.clipx.pickFolder is not available (preload not wired?)");
        return;
      }
      const picked = await window.clipx.pickFolder();
      console.log("Picked folder:", picked);

      if (picked) setFolderPath(picked);
    } catch (err) {
      console.error("Failed to pick folder:", err);
    }
  };

  return (
    <div className={"app"}>
      {/*<Button variant={"contained"} onClick={pickFolder}>Pick Folder</Button>*/}

      {folderPath && <pre>Folder: {folderPath}</pre>}

      {clip && (<ClipEditor clip={clip}/>)}
      {!!files.length && (
        <ClipGrid clips={files} baseFolder={'D:/Clips'} onSelect={(clip) => {
          console.log("Selected clip:", clip);
          setClip(clip);
        }} />
      )}
    </div>
  );
}
