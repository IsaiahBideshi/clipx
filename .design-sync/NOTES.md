# design-sync notes (ClipX)

- ClipX is an app, not a published package: there is no dist/ or .d.ts. The bundle entry is `.design-sync/entry.js`, a hand-written barrel over `src/components/*`, plus `src/index.css` (tokens) and `ClipXProvider`. Always build with `--entry ./.design-sync/entry.js --node-modules ./node_modules`.
- Adding a component means adding it in three places: `entry.js`, `componentSrcMap`, and `dtsPropsFor` (the prop types are hand-written because they can't be generated from JSX).
- `UploadMenu` is exported from `src/components/ClipEditor.jsx` (the export was added for this sync).
- `ClipXProvider` (`.design-sync/ClipXProvider.jsx`) wraps the app's MUI `appTheme` plus a `MemoryRouter`. It mirrors `src/main.jsx` minus the query client, which none of the synced components use.
- The bundle includes the real `src/lib/supabase.js` (via `ClipEditor` -> `UploadMenu`), including the publishable Supabase key and `pages/signup.jsx`/`auth.css`. Previews pass a fake session id; friend loading makes a harmless failing request.
- Fonts: the theme names "Sora", but the app never loads it, so ClipX renders in Segoe UI. The user chose to match the app, not ship Sora: `runtimeFontPrefixes` suppresses `[FONT_MISSING]` for Sora/Avenir/Trebuchet MS.
- Preview harness: components use `position: fixed` (widgets, context menu, overlays). Previews wrap them in a `transform: translateZ(0)` surface so the fixed positioning stays inside the card. `ClipEditor`/`ChangelogModal` use `cardMode: single`.
- `VideoPlayer` controls only show on hover/focus, so its preview focuses `.mute-button` on mount to make them visible.
- With no Electron (`window.clipx`), thumbnails show the placeholder and players stay in their loading state. This is expected, not a bug.

## Known render warns
- MenuBar: broken app-icon image. The component uses the relative path `assets/clipx_icon.svg`, which only resolves inside the app.
- ClipPreview: renders a bare `<video>` because no CSS in the repo styles `.clip-preview-container`.
- UploadingClips: plain text layout, because `.uploading-clips-container` has no styles in the repo.

## Re-sync risks
- `dtsPropsFor` is hand-maintained. Any prop change in `src/components` must be mirrored there, or the design agent codes against stale APIs.
- Preview changelog text is copied from CHANGELOG.md v1.1.7-v1.2.1 and will drift (cosmetic only).
- `entry.js` imports `src/index.css` wholesale, including `html, body { overflow: hidden }`. Watch for clipped designs if that rule matters.
- Playwright/Chromium is installed only under `.ds-sync/` and `%LOCALAPPDATA%/ms-playwright`, so it must be reinstalled on a fresh machine.
