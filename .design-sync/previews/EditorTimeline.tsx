import { EditorTimeline } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const Trimmed = () => (
  <Surface width={760}>
    <EditorTimeline duration={30} currentTime={11} inPoint={4} outPoint={22} onSeek={() => {}} onSetIn={() => {}} onSetOut={() => {}} />
  </Surface>
);

export const FullLength = () => (
  <Surface width={760}>
    <EditorTimeline duration={30} currentTime={3} inPoint={0} outPoint={30} onSeek={() => {}} onSetIn={() => {}} onSetOut={() => {}} />
  </Surface>
);
