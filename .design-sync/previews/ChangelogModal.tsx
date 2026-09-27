import { ChangelogModal } from "clipx";

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

export const Default = () => (
  <div style={{ width: 900, height: 760, position: "relative", transform: "translateZ(0)", background: "var(--page-surface)", fontFamily: "var(--app-font)", color: "#f7f8ff" }}>
    <ChangelogModal changelog={changelog} currentVersion="v1.2.1" onClose={() => {}} />
  </div>
);
