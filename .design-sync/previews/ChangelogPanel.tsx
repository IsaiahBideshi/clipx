import { ChangelogPanel } from "clipx";

function Surface({ children, width = 420, height }) {
  return (
    <div style={{ background: "var(--page-surface)", padding: 24, width, height, position: "relative", transform: "translateZ(0)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
      {children}
    </div>
  );
}

const changelog = `## v1.2.1

- Fix: Volume and mute settings are remembered between restarts.
- Fix: Sharing a clip no longer breaks when friend usernames fail to load.
- Fix: Library thumbnails refresh sooner instead of showing stale images.

## v1.2.0

- New: Clips now stored in Cloud instead of YouTube.
- New: Reusable video player with playback, volume, fullscreen and keyboard shortcuts.
- New: Library page redesign.
- Fix: Renaming a clip to an existing name no longer breaks.

## v1.1.7

- Feat: Automatically download and install updates on first launch.
- Feat: Menu bar redesign.
- Feat: Navigation bar updates.`;

export const CurrentVersion = () => (
  <Surface width={640}>
    <ChangelogPanel changelog={changelog} highlightedVersion="v1.2.1" />
  </Surface>
);

export const SinceLastUpdate = () => (
  <Surface width={640}>
    <ChangelogPanel changelog={changelog} highlightedVersion="v1.2.1" highlightedLabel="New" fromVersion="v1.1.7" />
  </Surface>
);
