import { ClipContextMenu } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const Default = () => (
  <Surface width={300} height={240}>
    <ClipContextMenu position={{ x: 24, y: 24 }} onOpen={() => {}} onRename={() => {}} onOpenInExplorer={() => {}} onDelete={() => {}} />
  </Surface>
);

export const WhileBusy = () => (
  <Surface width={300} height={240}>
    <ClipContextMenu position={{ x: 24, y: 24 }} disabled onOpen={() => {}} onOpenInExplorer={() => {}} />
  </Surface>
);
