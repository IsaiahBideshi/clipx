import { UploadingClips } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const InProgress = () => (
  <Surface width={640}>
    <UploadingClips
      clips={[
        { id: "1", name: "Ace on Ascent", progress: 0.72 },
        { id: "2", name: "1v4 clutch on Mirage", progress: 0.35 },
        { id: "3", name: "Rocket League ceiling shot", progress: 0.08 },
      ]}
    />
  </Surface>
);
