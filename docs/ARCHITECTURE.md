# ClipX architecture

How ClipX is put together. For setup and commands see the [README](../README.md); for the database tables see [SCHEMA.md](../SCHEMA.md).

## Overview

ClipX has two parts:

- **The desktop app**: a Windows Electron app. The main process is in `electron/`, the renderer (React 19 + Vite) in `src/`.
- **The website and API**: a Vercel deployment at `clipx.bideshi.tech`. It serves the marketing site (`public/landing/`), the public `/clip/<id>` share page and the serverless API (`api/` + `api-handlers/`).

Supabase is the database and auth provider. Uploaded clips are stored in Azure Blob Storage.

## Repo layout

| Path | What's in it |
| --- | --- |
| `electron/main.js` | Main process entry: window, local HTTP server, IPC registration |
| `electron/preload.js` | The `window.clipx.*` bridge the renderer calls |
| `electron/ipc/` | IPC handlers, grouped by area |
| `electron/services/` | Clip index, editing/uploads, OBS recording, game detection, notifications, updates, Google auth |
| `electron/utils/` | Pure helpers (recording plan, audio mix, manifests, ffmpeg path, …) |
| `src/pages/`, `src/components/`, `src/lib/` | The renderer |
| `src/sharePlayer.jsx` | Entry for the share page player bundle |
| `api/index.js` | The single Vercel function; routes `/api/*` and `/clip/*` to `api-handlers/` |
| `public/landing/` | Marketing, privacy and terms pages |
| `public/clip-player/` | Built share player (committed, see [Share page](#share-page)) |
| `scripts/` | Build script and one-off maintenance scripts |
| `tests/` | `node:test` tests |

The main process is ESM (`"type": "module"`), and so is `api/`.

## Desktop app

### Renderer and IPC

- The React app only runs inside Electron; it is never served in a browser. The one exception is `src/sharePlayer.jsx`, which bundles `VideoPlayer` for the share page.
- In dev, Electron loads the Vite dev server (`ELECTRON_RENDERER_URL`, `127.0.0.1:5173`). Packaged builds serve `dist/index.html` from a local HTTP server started in `electron/main.js`, with SPA fallback.
- Routes use `HashRouter`: `#/` (Local Files), `#/recording`, `#/library`, `#/profile`, `#/settings`, `#/signup`, `#/login`.
- The renderer talks to the main process only through the `window.clipx.*` methods exposed in `electron/preload.js`, handled in `electron/ipc/`.

### Configuration

- `electron/main.js` loads only `.env`, via `dotenv/config`. Vite loads `.env` and `.env.local` for the renderer's `VITE_*` values at build time. The main process reads `VITE_DATABASE_URL` too, so set it in `.env`: in `.env.local` it would only reach the renderer. (`vercel env pull` may create a `.env.local` for the Vercel CLI.)
- The renderer's API base is `import.meta.env.VITE_DATABASE_URL`, defaulting to `https://clipx.bideshi.tech` (see `src/lib/accountApi.js`).
- The main process fetches the Google OAuth client ID at runtime from `{API_BASE}/api/keys`. The client secret stays on the server (`GOOGLE_CLIENT_SECRET`), where `/api/google/token` uses it.
- `CLIPX_ALLOW_PRERELEASE=true` in the user's environment opts a stable install into pre-releases (see [Releases](#releases)).

### Auth

- The renderer uses Supabase auth with a custom storage adapter that persists the session through IPC (`window.clipx.authStorage*`), falling back to `localStorage` outside Electron.
- API functions use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role, never exposed to the renderer). Routes that need a signed-in user authenticate callers with the user's Supabase access token as a Bearer token (`getAuthenticatedUser` in `api-handlers/auth.js`). `/api/keys`, `/api/latest-version`, `/api/users`, `/api/clips?visibility=public` and the `/clip/<id>` share page don't need one.
- Google OAuth uses a PKCE loopback flow on an OS-assigned `127.0.0.1` port (a fixed port can land in a Windows excluded port range and fail with `EACCES`). The app sends its `redirect_uri` to `/api/google/token`, which falls back to port **51723** for builds up to v1.2.5 that don't send one. YouTube refresh tokens are stored in the OS keychain via keytar.

### Local clip index

- Clip metadata lives in SQLite at `%APPDATA%/clipx/clip-index.sqlite` (WAL mode, with chokidar watching the clip folders), plus a legacy `clipsData.json` in `%APPDATA%/`. In dev, userData is redirected to `%APPDATA%/clipx-dev`.
- `better-sqlite3` and `keytar` are native modules and must be rebuilt for Electron's ABI after a fresh `npm install` (`npm.cmd run rebuild:electron`).
- FFmpeg comes from `ffmpeg-static`, driven through fluent-ffmpeg. The binary must stay unpacked (`asarUnpack`); `electron/utils/ffmpeg.js` rewrites the path to `app.asar.unpacked`.

## Recording

In-app clipping lives in `electron/services/obsService.js`, with its settings on the `#/recording` page.

### OBS

- ClipX drives portable OBS, which it downloads into `userData/obs/<version>`. The version is pinned by `OBS_VERSION` + `OBS_ZIP_SHA256` in `electron/utils/obsConfig.js`. To upgrade, bump both, and first check the new version for startup dialogs (first-run wizard, What's New, safe mode), because ClipX rewrites OBS's config on every launch.
- OBS runs in Advanced output mode, with the encoder's CBR bitrate in the profile's `recordEncoder.json`. Simple mode has no bitrate setting for its quality presets, and its "Same as stream" quality only gives the replay buffer one audio track.
- The replay buffer is `seconds + KEYFRAME_PADDING_SECONDS` (`obsConfig.js`), so files run a few seconds longer than the manifest's `seconds`.

### Recorders

Each recording is its own OBS process:

- `main` records at primary quality, follows the mouse or focused app when auto switch is on, and owns the audio tracks.
- `screen-<displayId>` records each secondary screen. With auto switch, every screen gets one, and the Windows primary screen's uses primary quality.
- With auto switch and only one screen turned on, `main` follows across every screen (including the ones turned off) and there are no `screen-<displayId>` recorders (see `getFollowScreens`).

`planRecorders` in `electron/utils/recordingPlan.js` decides the set; the renderer imports the same file to preview it.

Each recorder runs from `userData/obs/recorders/<key>/` with junctions to the shared install, so it gets its own `config/` (portable OBS resolves `../../config` from its working folder). Recorders are spawned hidden (`windowsHide` plus `SysTrayEnabled=false` in `user.ini`, so no window or tray icon, though they still show as "OBS Studio" in Task Manager), and driven over obs-websocket on random ports. They aren't spawned `detached`, so Node puts them in its own kill-on-close job object and Windows ends them when ClipX exits.

### Clip folders and `clip.json`

- Every hotkey save becomes a clip folder `ClipX Replays/<name>/` holding the primary `<name>.mp4`, `Screen <n>.mp4` files and a `clip.json` manifest (`electron/utils/clipManifest.js`: files, roles, screens, audio track names, detected game).
- `<name>` comes from `getClipName`, e.g. `Clip 2026-Oct-25 [VALORANT] 03꞉52꞉30PM`. The detected game goes in the brackets (left out when there's none), and the time uses `꞉` (U+A789) because Windows doesn't allow `:` in file names.
- Recorders write to `ClipX Replays/.recording/` first, which the index ignores.
- The index stores `group_path`/`group_role` and hides `secondary` files from the grid. `local-clips:get-group` returns a clip's whole group.
- The primary is indexed with `is_new` set, which shows a New tag on its card until the clip is opened (`local-clips:mark-seen`). Upserts without an `isNew` option keep the stored flag, and renaming passes the old path's flag to the new one.
- Grouped files are indexed with the manifest's `createdAt` instead of the file's birthtime.
- Clips without a `clip.json` (anything not recorded by ClipX) have a single audio track.

### Hotkey

The clip hotkey is polled with `GetAsyncKeyState` (`electron/utils/keyState.js`, every 25 ms) instead of Electron's `globalShortcut`, because games that read raw input (e.g. League of Legends) switch off `RegisterHotKey` hotkeys while they're focused. Polling doesn't block the key from reaching other apps. Like OBS's own hotkeys, it can't see keys while an app running as administrator is focused.

### Notifications

Clip notifications are ClipX's own overlay, not Windows toasts (Focus Assist hides those in games). `electron/services/toastService.js` shows `electron/toastWindow.html` as a transparent, click-through, non-focusable, always-on-top window at a top corner of the screen being recorded, and the page synthesizes the chime with Web Audio.

- They fire only after a clip's files are in place, never on the hotkey press.
- Borderless and Windows' default fullscreen show them. True exclusive fullscreen doesn't, but the sound still plays.

### Audio tracks

- Track 1 is always the full mix (desktop audio, plus the mic when a mic track exists), for normal playback.
- With any tracks added, the rest split the sound so a mixer can raise, lower or mute each part by summing them instead of track 1: up to 4 sources (`planAudioTracks`), then a last track holding everything else.
- That last track is `Desktop audio` when only the mic is separated, otherwise `Other apps`: one hidden process capture per other app with a window, re-synced every 5 s. OBS has no "everything except these apps" capture, so sounds from apps without a window are only in track 1.
- Each capture follows one window per exe name, so when two separate programs share an exe (e.g. two Electron apps), only one of them reaches `Other apps`.
- OBS captures a process and all its children, so `pickOtherAudioApps` skips explorer.exe, any app with another windowed app under it (e.g. Steam running a game) and anything under a tracked app; otherwise the same sound would land on two tracks.
- `clip.json` lists each track's `kind`.
- The sliders on the Recording page apply while recording. The app sliders only change that app's own track, not track 1, so the split tracks only add up to track 1 when those sliders were at 100%.
- When mixing them with ffmpeg, `amix` divides by the number of inputs unless you pass `normalize=0`.

### Game detection

`electron/services/gameDetectionService.js` reads the foreground window through `koffi` (`electron/utils/foregroundWindow.js`) and treats exes from `HKCU\System\GameConfigStore` and store install folders as games.

- IGDB ids are resolved via `/api/games?steam=<appid>` (Steam installs) or name search. IGDB needs a signed-in user.
- Matches and user corrections are cached in `userData/games.json`.
- Users can assign a game to any app on the Recording page (for launchers with odd exe names, e.g. Plutonium). Those are stored by exe name (`games.json` keys without a path) and count as the game while that process is running, even when it isn't in front.
- The detected game lasts until its process exits (the Recording page clears it then). A clip is tagged with the current game, or with one that closed within the clip's length.
- On the server, `/api/games` reads `IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET`, so the app needs no IGDB keys. `api-handlers/igdb.js` gets a Twitch app token from those, keeps it in memory and gets a new one when IGDB answers 401. If game search breaks with Twitch token errors, check the secret in Vercel.

## Editing clips

The editor is `src/components/ClipEditor.jsx`.

### Rendering and the audio mixer

- Saving a trim or uploading goes through `renderClipSegment` in `electron/services/clipService.js`, which writes at most one audio track (none when the source has no audio): track 1 copied while the user hasn't changed a volume, otherwise the user's mix (`buildAudioOutputOptions` in `electron/utils/audioMix.js`: `amix=normalize=0` plus `alimiter`, video still copied).
- The mixer only shows when every track has a `kind`.
- Its preview extracts each track with `-c copy` to `%TEMP%/clipx/tracks/` (deleted when the editor closes) and plays them through Web Audio gain nodes synced to the video. That's why the `clipx` scheme is `corsEnabled`; without it Web Audio gets silence.
- The `clipx` handler only serves requests whose referrer is the app's own loopback page, so remote frames (the Library's YouTube embeds) can't read local files through it.
- `renderStreamCopy` and the unused 4K render keep whatever audio their input has.

### Saved clips and originals

- Saving a trim writes it to `ClipX Videos/` inside the clip's folder and stores the original's path as `originalPath` in the saved clip's metadata (`saved_metadata_json`).
- `listLocalClips` hides any clip that a saved clip which still exists points to, so the original leaves the grid and comes back when its saved clips are deleted. The editor's "View original" button (`local-clips:get-original`) opens it again.
- `renameClip` and `keepClipScreen` call `moveSavedClipOriginal` so the link follows the original's file. That only updates the index, so `upsertIndexedClip` reads the legacy `clipsData.json` only for a saved clip the index has no metadata for; otherwise a refresh would put the old `originalPath` back.
- Saves made before this (originals renamed to `[ORIGINAL] <name>`) have no `originalPath`, so those originals stay in the grid.

### Renaming and deleting

- `clip.json` matches files by name, so `renameClip` updates the file's entry after renaming it.
- `deleteClip` refuses a primary that still has screen files (they use its audio) and removes a deleted screen's entry.
- `deleteClipGroup` deletes every file and `clip.json`, then the folder only if it's empty.
- `getClipGroup` leaves out files that no longer exist.
- "Keep only <screen>" in the editor's Delete menu (`keepClipScreen`) deletes every other file. Keeping a screen file first writes `<primary name> (Screen <n>).mp4` with that video and all of the primary's audio tracks (stream copy, aligned by end using lengths read from both files), which becomes the primary. Before anything is deleted, `clip.json` is rewritten with the kept file as primary and every other file as a secondary, so the group stays valid whichever deletes fail; afterwards the deleted files' entries are removed. Because grouped files are indexed with the manifest's `createdAt`, the new file keeps the clip's place in the grid.

### Multi-screen clips

- The grid shows one stacked card per primary with a screen count.
- The editor (`ScreenStage.jsx`, `src/lib/screenLayout.js`) shows one screen at a time with a button per screen under it, named after the Windows `primary` monitor ("Primary screen", "Secondary screen 1", …). It swipes toward the picked screen's side using each manifest `screen`'s desktop `x`/`y` (left to right by `number` when missing).
- It starts on the fixed primary or, with auto switch, the Windows `primary` monitor's file.
- Screen files have no audio, so the primary's audio plays (and is saved) alongside them.

**Alignment.** Files from separate OBS processes end within ~0.1 s of each other but can start several seconds apart (the replay buffer starts on a keyframe), so they're aligned by their end: a file's time plus `primary duration − its duration` is the primary's time. The editor keeps the playhead and trim points in the primary's time, so swapping screens doesn't move them. Saving a screen file maps its video with the primary's audio from that shifted time (`-itsoffset` when it falls before the primary starts).

**Duplicate screens with auto switch.** When `main` stayed on one screen for the whole buffer (`seconds + KEYFRAME_PADDING_SECONDS`, or since recording started), `getDuplicateScreen` drops one copy and the manifest stores the clip as a fixed primary on that screen. It compares `main`'s picture of that screen (letterboxed when the shapes differ) with the screen recorder's output height, fps and bitrate:

- If `main` is at least as good on all three and isn't letterboxed, the screen's recording isn't saved.
- If the screen's file is at least as good on all three, the clip is first saved with both files so the notification isn't held up (the copy takes ~10 s for a 1 GB clip on a hard drive). Then `moveAudioToScreen` runs in the background: it copies `main`'s audio tracks onto the screen's video (aligned by end) into `<primary>.mp4.part`, which the index ignores, replaces the primary with it, deletes the screen's file and the primary's cached thumbnail, and rewrites `clip.json` as a fixed primary on that screen.
  - The primary keeps its path, so `LocalFiles.jsx` remounts an open editor when the index reports the same path with a new `id`; otherwise it would keep the old file's group, lengths and extracted audio.
  - If a step fails, the clip stays as it was saved, which is a valid clip.
  - ffmpeg keeps both files open while it runs, so deleting or renaming that clip fails until it's done.
- Otherwise both files are kept.

## Uploads and sharing

### Uploads

- `uploadClip` in `clipService.js` renders the trimmed clip, a thumbnail and (when needed) a stream copy into `%TEMP%/clipx/uploads/`, then uploads each one straight to Azure Blob Storage with an upload URL from `/api/clips`. The renderer then saves the clip row with the `create_clip_with_tags` RPC and deletes the uploaded blobs if that fails.
- Visibility is `public`, `friends` or `private`.
- Clips uploaded before v1.2.0 are unlisted YouTube videos (`youtube_video_id`), which the Library still plays as YouTube embeds.

### Stream copies

Uploads above ~10 Mbps also get a 1080p, ~8 Mbps stream copy stored next to the original as `<blob_name without .mp4>.stream.mp4` in the `clips` container.

- There's no DB column for it: the name is derived in both `electron/utils/streamCopy.js` and `api-handlers/clips/azure.js`, so change them together.
- `/api/clips/stream` and `/clip/<id>/video` serve the copy when it exists and fall back to the original.
- `scripts/backfill-stream-copies.js` creates copies for clips uploaded before this existed.

### Share page

Public clips have a share page at `/clip/<id>` (`api-handlers/clips/share.js`), which plays the clip in any browser. Its player is `VideoPlayer` bundled by `npm.cmd run build:player` into `public/clip-player/`. Vercel has no build step, so that output is committed and has to be rebuilt after changing `VideoPlayer.jsx`, `player.css` or `playerPrefs.js`.

## CI

Pull requests to `master` run `ci.yml` on `windows-latest`: `npm ci`, a `node --check` syntax pass over `api/`, `api-handlers/`, `electron/` and `scripts/`, then `npm test` and `build:react`. Last, it rebuilds the share player and fails if `public/clip-player/` differs from what's committed.

GitHub skips `pull_request` runs when the PR's head commit message contains `[skip ci]`.

## Releases

- A push to `master` or a `v*` tag triggers `release.yml`. It builds, then creates a GitHub release from the `## vX.Y.Z` section in `CHANGELOG.md` (the workflow fails if the section is missing), so the version in `package.json` must match a `## vX.Y.Z` heading.
- Pushing a version bump alone (no tag) releases as `v{version}`. The `dist/latest.yml` artifact powers in-app auto-updates (electron-updater).
- `release.yml` stops before building when a release for that tag already exists, so `master` pushes without a version bump leave every release alone. (Before this check, those pushes rebuilt the current version's release files from whatever was on `master`.)
- To rebuild a release's files from its own tag, run the **Rebuild release** workflow (`rebuild-release.yml`) with the tag. It replaces the installer, blockmap and `latest.yml` (keeping the release's original `releaseDate`; a tag whose build makes no `latest.yml`, like v1.0.2, has it removed) and leaves the notes and dates alone.
- Release runs for the same tag share a concurrency group (`release-<tag>`, set after a small job resolves the tag), so only one runs at a time and a waiting run sees the release the one before it created. GitHub keeps at most one waiting run per group, so a newer run cancels the one already waiting. Each run builds the commit that triggered it, so if a later `master` push on the same version replaces a waiting tag run, the release is built from that later commit instead of the tagged one. Runs for different tags don't wait on each other.

### Pre-releases

A version with a pre-release part (e.g. `1.3.0-beta.1`) is published as a GitHub pre-release. Stable installs skip it unless `CLIPX_ALLOW_PRERELEASE=true` is set in the user's environment (read by the main process at launch). Installs already on a pre-release keep getting pre-releases. `/api/latest-version` ignores pre-releases, so opted-in installs find them on launch, on the hourly check or via Check for updates, not the 20 s poll.

### Announcements

To show a one-time how-to after an update, add a `# vX.Y.Z Title` section to `ANNOUNCEMENTS.md`; its body runs until the next `# vX.Y.Z` heading. It shows at the top of the post-update changelog popup for users updating from an older version to that version or later. Fresh installs don't see it.
