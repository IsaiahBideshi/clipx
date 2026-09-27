import { ClipCard } from "clipx";

const now = Date.now();

function Surface({ children }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width: 320, fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const Default = () => (
  <Surface>
    <ClipCard
      clip={{ id: 1, name: "Valorant 2026.09.26 - ace on Ascent.mp4", path: "C:/Clips/Valorant/ace.mp4", createdAt: new Date(now - 3 * 3600 * 1000).toISOString() }}
      onClick={() => {}}
      onContextMenuAction={() => {}}
    />
  </Surface>
);

export const LongName = () => (
  <Surface>
    <ClipCard
      clip={{ id: 2, name: "Apex Legends 2026.09.20 - triple squad wipe from the ring edge with Wraith portal play.mp4", path: "C:/Clips/Apex/wipe.mp4", createdAt: new Date(now - 6 * 86400 * 1000).toISOString() }}
      onClick={() => {}}
      onContextMenuAction={() => {}}
    />
  </Surface>
);
