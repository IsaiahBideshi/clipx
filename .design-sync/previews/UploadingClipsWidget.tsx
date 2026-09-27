import { UploadingClipsWidget } from "clipx";

function Surface({ children }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, height: 300, width: 420, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

const clips = [
  { id: "1", name: "Ace on Ascent", status: "uploading" },
  { id: "2", name: "1v4 clutch on Mirage", status: "uploaded", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" },
  { id: "3", name: "Rocket League ceiling shot", status: "failed", error: "YouTube quota exceeded" },
];

export const Expanded = () => (
  <Surface>
    <UploadingClipsWidget clips={clips} expanded onToggleExpanded={() => {}} onDismiss={() => {}} />
  </Surface>
);

export const Collapsed = () => (
  <Surface>
    <UploadingClipsWidget clips={clips.slice(0, 1)} expanded={false} onToggleExpanded={() => {}} onDismiss={() => {}} />
  </Surface>
);

export const AllFinished = () => (
  <Surface>
    <UploadingClipsWidget clips={clips.slice(1)} expanded onToggleExpanded={() => {}} onDismiss={() => {}} />
  </Surface>
);
