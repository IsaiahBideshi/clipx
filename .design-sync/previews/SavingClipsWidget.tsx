import { SavingClipsWidget } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

const clips = [
  { id: "1", name: "Ace on Ascent", status: "saving" },
  { id: "2", name: "1v4 clutch on Mirage", status: "saved" },
  { id: "3", name: "Rocket League ceiling shot", status: "failed", error: "A clip with that name already exists" },
];

export const Expanded = () => (
  <Surface height={240}>
    <SavingClipsWidget clips={clips} expanded onToggleExpanded={() => {}} onDismiss={() => {}} />
  </Surface>
);

export const Collapsed = () => (
  <Surface height={120}>
    <SavingClipsWidget clips={clips.slice(0, 2)} expanded={false} onToggleExpanded={() => {}} onDismiss={() => {}} />
  </Surface>
);

export const AllFinished = () => (
  <Surface height={200}>
    <SavingClipsWidget clips={clips.slice(1)} expanded onToggleExpanded={() => {}} onDismiss={() => {}} />
  </Surface>
);
