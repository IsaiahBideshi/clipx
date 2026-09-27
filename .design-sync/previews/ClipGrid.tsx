import { ClipGrid } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

const now = Date.now();
const hour = 3600 * 1000;
const clips = [
  { id: 1, name: "Valorant - ace on Ascent.mp4", path: "C:/Clips/1.mp4", createdAt: new Date(now - 2 * hour).toISOString() },
  { id: 2, name: "CS2 - 1v4 clutch on Mirage.mp4", path: "C:/Clips/2.mp4", createdAt: new Date(now - 9 * hour).toISOString() },
  { id: 3, name: "Rocket League - ceiling shot.mp4", path: "C:/Clips/3.mp4", createdAt: new Date(now - 30 * hour).toISOString() },
  { id: 4, name: "Apex Legends - squad wipe.mp4", path: "C:/Clips/4.mp4", createdAt: new Date(now - 4 * 24 * hour).toISOString() },
  { id: 5, name: "Fortnite - last circle win.mp4", path: "C:/Clips/5.mp4", createdAt: new Date(now - 12 * 24 * hour).toISOString() },
  { id: 6, name: "Overwatch 2 - team kill as Genji.mp4", path: "C:/Clips/6.mp4", createdAt: new Date(now - 40 * 24 * hour).toISOString() },
];

export const Loaded = () => (
  <Surface width={640}>
    <ClipGrid clips={clips} onSelect={() => {}} onContextMenuAction={() => {}} />
  </Surface>
);

export const Loading = () => (
  <Surface width={640}>
    <ClipGrid clips={[]} loading onSelect={() => {}} onContextMenuAction={() => {}} />
  </Surface>
);

export const LoadingMore = () => (
  <Surface width={640}>
    <ClipGrid clips={clips.slice(0, 3)} hasMore loadingMore onSelect={() => {}} onContextMenuAction={() => {}} />
  </Surface>
);
