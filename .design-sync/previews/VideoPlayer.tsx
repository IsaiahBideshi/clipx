import { useEffect, useRef } from "react";
import { VideoPlayer } from "clipx";

function Surface({ children, width = 860 }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.querySelector(".mute-button")?.focus();
  }, []);

  return (
    <div ref={ref} style={{ background: "var(--page-surface)", padding: 24, width, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

export const EditorPlayer = () => (
  <Surface>
    <VideoPlayer src="" showSkipButtons autoPlay={false} volume={0.8} />
  </Surface>
);

export const Muted = () => (
  <Surface>
    <VideoPlayer src="" muted autoPlay={false} />
  </Surface>
);
