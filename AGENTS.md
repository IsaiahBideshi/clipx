# AGENTS.md

## What this repo is

- **ClipX** = Windows Electron desktop app (React 19 + Vite renderer) + a Vercel deployment (`clipx.bideshi.tech`) that serves the marketing site (`public/landing/`) and serverless API functions (`api/`). Supabase is the database and auth provider.
- The React app in `src/` **only runs inside Electron** — it is never served in a browser. The one exception is `src/sharePlayer.jsx`, which bundles `VideoPlayer` for the public `/clip/<id>` share page (see `build:player`). Packaged builds serve `dist/index.html` from a local HTTP server started in `electron/main.js` (with SPA fallback). Routes use `HashRouter` (`#/`, `#/settings`, `#/library`, `#/profile`, `#/signup`, `#/login`).
- Renderer ↔ main process communication goes through `window.clipx.*` IPC methods exposed in `electron/preload.js`. Anything new in preload must be mirrored in the renderer, and vice versa.
- Main process is ESM (`"type": "module"`) — use `import`/`export` everywhere, including `api/`.

## Commands

PowerShell here has execution-policy disabled, so **`npm` fails; always use `npm.cmd`**.

- `npm.cmd run dev` — starts Vite on `127.0.0.1:5173` then launches Electron (loads the dev server URL). This is the dev loop; Electron must open for most features to work (IPC, keytar, better-sqlite3).
- `npm.cmd run build` — `vite build` then `electron-builder --win`; outputs `dist/ClipX-Setup.exe` + `latest.yml` (used by electron-updater).
- `npm.cmd run build:react` / `build:electron` — the two halves separately.
- `npm.cmd run build:player` — bundles `src/sharePlayer.jsx` into `public/clip-player/` for the `/clip/<id>` share page. Vercel has no build step, so the output is committed: re-run it and commit after changing `VideoPlayer.jsx`, `player.css` or `playerPrefs.js`.
- `npm.cmd test` — runs `tests/**/*.test.js` with Node's built-in test runner (`node:test`, no extra dependencies). Tests live in `tests/`, not next to the source, because electron-builder packages everything under `electron/`. Only import modules that load in plain Node: no `electron` import, no Supabase client created when the module loads (e.g. `api-handlers/auth.js`), and no `import.meta.env` at the top level.
- `eslint.config.js` exists but the eslint packages are **not installed** and there is no lint script — do not claim to run lint.

## Env & secrets

- Secrets live in the gitignored `.env` (Supabase service-role key, Google/Twitch IGDB keys, etc.). Never commit them or echo their values. `.env.local` is not used by the app — if `vercel env pull` creates one locally, it's only for the Vercel CLI (`vercel dev`).
- `electron/main.js` loads `.env` via `dotenv/config`; the renderer gets `VITE_*` from the same `.env` at build time. No service loads `.env.local`, so nothing can clobber `process.env`.
- Renderer-side API base: `import.meta.env.VITE_DATABASE_URL`, defaulting to `https://clipx.bideshi.tech` (see `src/lib/accountApi.js`).
- Google OAuth client ID/secret are fetched at runtime by the main process from `{API_BASE}/api/keys`, not read from env directly.
- IGDB game search/lookup goes through `{API_BASE}/api/games` (signed-in users only). The server reads `IGDB_CLIENT_ID` + `IGDB_ACCESS_TOKEN` from its env, so the Electron app needs no IGDB keys. Twitch app tokens expire after ~60 days; when game search breaks with IGDB 401s, update `IGDB_ACCESS_TOKEN` in Vercel.
- Auth in the renderer uses Supabase with a custom storage adapter that persists sessions via IPC (`window.clipx.authStorage*`), falling back to `localStorage` outside Electron.

## Gotchas

- `better-sqlite3` and `keytar` are native modules and break under Electron's ABI after a fresh `npm install`. The error message in `electron/services/clipIndexService.js` tells users to run `npm.cmd run rebuild:electron`, but **that script does not exist** in `package.json`. `@electron/rebuild` is present transitively (via electron-builder); use `npm.cmd exec electron-rebuild -f -w better-sqlite3 -w keytar` (or add the missing script).
- Clip metadata lives in SQLite at `%APPDATA%/clipx/clip-index.sqlite` (WAL mode, chokidar-watched folders), plus a legacy `clipsData.json` in `%APPDATA%/`. In dev, userData is redirected to `%APPDATA%/clipx-dev`.
- FFmpeg: `ffmpeg-static` + fluent-ffmpeg; ffmpeg binary must stay unpacked (`asarUnpack`), handled by `electron/utils/ffmpeg.js` (`app.asar.unpacked` path rewrite).
- Google OAuth uses a PKCE loopback flow on an OS-assigned `127.0.0.1` port (a fixed port can land in a Windows excluded port range and fail with `EACCES`). The app sends its `redirect_uri` to `/api/google/token`, which falls back to port **51723** for builds up to v1.2.5 that don't send one. YouTube refresh tokens are stored in the OS keychain via keytar.
- Uploads above ~10 Mbps also get a 1080p, ~8 Mbps stream copy stored next to the original as `<blob_name without .mp4>.stream.mp4` in the `clips` container. There is no DB column for it: the name is derived in both `electron/utils/streamCopy.js` and `api-handlers/clips/azure.js`, so change them together. `/api/clips/stream` and `/clip/<id>/video` serve the copy when it exists and fall back to the original; `scripts/backfill-stream-copies.js` creates copies for clips uploaded before this existed.
- In-app clipping (`electron/services/obsService.js`) drives a portable OBS that ClipX downloads into `userData/obs/<version>`. The version is pinned by `OBS_VERSION` + `OBS_ZIP_SHA256` in `electron/utils/obsConfig.js`; bump both to upgrade. OBS's config is rewritten on every launch, so check new OBS versions for startup dialogs (first-run wizard, What's New, safe mode) before bumping. OBS is spawned hidden and controlled over obs-websocket on a random port, and Node's job object kills it when ClipX exits.
- `api/` functions use `process.env.SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role — never expose to the renderer) and authenticate callers with the user's Supabase access token as a Bearer token.

## CI & releases

- Pull requests to `master` run `ci.yml` on `windows-latest`. It runs `npm ci`, a `node --check` syntax pass over `api/`, `api-handlers/`, `electron/` and `scripts/`, then `npm test` and `build:react`. Last, it rebuilds the share player and fails if `public/clip-player/` differs from what's committed. GitHub also skips `pull_request` runs when the PR's head commit message contains `[skip ci]`, so only use `[skip ci]` on commits that land on `master`.
- `master` push/tag `v*` triggers `release.yml`: builds, then creates a GitHub release from the `## vX.Y.Z` section in `CHANGELOG.md` (absent section ⇒ workflow fails). Bumper version in `package.json` must match a `## vX.Y.Z` heading.
- Pushing a version bump alone (no tag) releases as `v{version}`; the `dist/latest.yml` artifact powers in-app auto-updates.
- A version with a pre-release part (e.g. `1.3.0-beta.1`) is published as a GitHub pre-release. Stable installs skip it unless `CLIPX_ALLOW_PRERELEASE=true` is set in the user's environment (read by the main process at launch). Installs already on a pre-release keep getting pre-releases. `/api/latest-version` ignores pre-releases, so opted-in installs find them on launch, on the hourly check or via Check for updates, not the 20s poll.
- To show a one-time how-to after an update, add a `# vX.Y.Z Title` section to `ANNOUNCEMENTS.md`; its body runs until the next `# vX.Y.Z` heading. It shows at the top of the post-update changelog popup for users updating from an older version to that version or later. Fresh installs don't see it.
- Only cut a release (version bump, `CHANGELOG.md` release section, `v*` tag) when the user explicitly asks for one. Every other push to `master`, including PR merges, must have `[skip ci]` in the head commit message so `release.yml` doesn't run.

## Pull request reviews

- Greptile does not reliably review on push. After pushing to a PR, comment `@greptileai` on it to trigger a re-review; closing and reopening the PR is not needed.
- Each trigger leaves an `@greptileai` comment on the PR under the user's account.

## Docs

Before writing any code concerning electron, read the following documentation:
- https://www.electron.build/docs/features/auto-update/
- https://www.electron.build/docs/api/electron-updater/
- https://www.electron.build/docs/publish/

## Code writing style

- All code should match the already established style in this repo, do not stray from a pattern that is already here.
- Do not make code too obscure and complicated, look for the simplest way to implement something while also satisfying common edge cases for the user.
- When adding a feature, ask yourself whether it should have tests, and if it should, add them in `tests/` (see `npm.cmd test` above for what those tests can import).
- When adding a modal, make sure clicking outside of it closes it and doesn't click any buttons behind the modal.