import { RefreshButton } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const Sizes = () => (
  <Surface width={260}>
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <RefreshButton fontSize="small" onRefresh={() => {}} />
      <RefreshButton fontSize="medium" onRefresh={() => {}} />
      <RefreshButton onRefresh={() => {}} />
    </div>
  </Surface>
);

export const WithTitle = () => (
  <Surface width={360}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Library</h2>
      <span style={{ color: "rgba(255, 255, 255, 0.62)" }}>128 clips</span>
      <RefreshButton fontSize="medium" onRefresh={() => {}} />
    </div>
  </Surface>
);
