# ClipX conventions

ClipX is a dark-only Windows desktop app for recording, trimming and sharing game clips. Every component comes from `window.ClipX`.

## Wrapping and setup

Wrap every screen in `ClipXProvider`. It supplies the MUI dark theme (accent `#90caf9`, pill-shaped buttons, rounded 12px inputs) and a router. Without it, `NavBar` and `MenuBar` throw (they render router links), and the MUI-based parts of `UploadMenu`/`ClipEditor` fall back to light, default MUI styling.

```jsx
const { ClipXProvider, NavBar, ClipGrid } = window.ClipX;

<ClipXProvider>
  <div style={{ minHeight: "100vh", background: "var(--page-surface)", color: "#f7f8ff", fontFamily: "var(--app-font)" }}>
    <NavBar updateStatus="available" onUpdateClick={() => {}} />
    <ClipGrid clips={clips} onSelect={() => {}} onContextMenuAction={() => {}} />
  </div>
</ClipXProvider>
```

- The UI is always dark. Put content on `var(--page-surface)`, never on white.
- `ClipEditor` and `ChangelogModal` are full-screen overlays (`position: fixed`). Render them on top of a page, not inside a card.
- `SavingClipsWidget` and `UploadingClipsWidget` are pinned to the bottom-right of the window (`position: fixed`). Render them once at app level.
- `ClipContextMenu` is also fixed-positioned: pass the cursor position `{ x, y }` in window coordinates.
- Clip thumbnails and video only load inside the desktop app (`clipx://` URLs). In designs, cards show the grey placeholder thumbnail and the player shows its loading state. That's expected.

## Styling idiom

Components style themselves with their own CSS classes. Don't restyle them. For layout glue around them, use inline styles with these tokens (defined on `:root`):

| Token | Use |
|---|---|
| `--page-surface` | page background (layered dark gradient) |
| `--page-shadow` | elevation for raised panels |
| `--page-orb` | decorative warm glow |
| `--accent` / `--accent-rgb` | light blue accent `#90caf9`; tints via `rgba(var(--accent-rgb), 0.14)` |
| `--border` | hairline `rgba(255,255,255,0.12)` |
| `--app-font` | UI font stack |

Text colors: primary `#f7f8ff`, secondary `rgba(255,255,255,0.62)`. Panels use `#1a1d27` with a `1px solid rgba(255,255,255,0.14)` border and a 12–22px radius.

The app also defines these reusable classes:

- `eyebrow`: small uppercase section label
- `card-copy`: muted paragraph text
- `settings-container`: centered 60vw settings panel
- `upload-container`: the panel that wraps `UploadMenu`. Always give `UploadMenu` this parent.

## Where the truth lives

Read `styles.css` and the `_ds_bundle.css` it imports before styling. Per-component props are in `components/general/<Name>/<Name>.d.ts`, and usage is in `<Name>.prompt.md`.

## Example

```jsx
const { RefreshButton, ClipGrid, UploadingClipsWidget } = window.ClipX;

<section style={{ padding: 24 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
    <h2 style={{ margin: 0 }}>Library</h2>
    <span style={{ color: "rgba(255,255,255,0.62)" }}>128 clips</span>
    <RefreshButton fontSize="medium" onRefresh={reload} />
  </div>
  <ClipGrid clips={clips} onSelect={openEditor} onContextMenuAction={openMenu} />
  <UploadingClipsWidget clips={uploads} expanded onToggleExpanded={toggle} onDismiss={dismiss} />
</section>
```
