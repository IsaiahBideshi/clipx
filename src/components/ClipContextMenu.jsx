import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import EditIcon from '@mui/icons-material/Edit';

export default function ClipContextMenu({ clip, position, ref, onOpen, onDelete, onRename, onOpenInExplorer }) {
  return (
    <div className="clip-context-menu"
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 1000,
      }}
      ref={ref}
      >
      <div className="clip-context-menu-item" onClick={onOpen}>
        <FileOpenIcon />
        <span style={{ }}>Open</span>
      </div>
      <div className="clip-context-menu-item" onClick={onRename}>
        <EditIcon />
        Rename
      </div>
      <div className="clip-context-menu-item" onClick={onOpenInExplorer}>
        <FolderIcon />
        Open in Explorer
      </div>
      <div className="clip-context-menu-item" style={{ color: "red",  }}  onClick={onDelete}>
        <DeleteIcon />
        Delete
      </div>
    </div>
  );
}
