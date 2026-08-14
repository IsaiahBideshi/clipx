# AGENTS.md

## What this repo is

- **ClipX** = Windows Electron desktop app (React 19 + Vite renderer) + a Vercel deployment (`clipx.bideshi.tech`) that serves the marketing site (`public/landing/`) and serverless API functions (`api/`). Supabase is the database and auth provider.
- The React app in `src/` **only runs inside Electron** — it is never served in a browser. Packaged builds serve `dist/index.html` from a local HTTP server started in `electron/main.js` (with SPA fallback). Routes use `HashRouter` (`#/`, `#/settings`, `#/library`, `#/profile`, `#/signup`, `#/login`).
- Renderer ↔ main process communication goes through `window.clipx.*` IPC methods exposed in `electron/preload.js`. Anything new in preload must be mirrored in the renderer, and vice versa.
- Main process is ESM (`"type": "module"`) — use `import`/`export` everywhere, including `api/`.

## Commands

PowerShell here has execution-policy disabled, so **`npm` fails; always use `npm.cmd`**.

- `npm.cmd run dev` — starts Vite on `127.0.0.1:5173` then launches Electron (loads the dev server URL). This is the dev loop; Electron must open for most features to work (IPC, keytar, better-sqlite3).
- `npm.cmd run build` — `vite build` then `electron-builder --win`; outputs `dist/ClipX-Setup.exe` + `latest.yml` (used by electron-updater).
- `npm.cmd run build:react` / `build:electron` — the two halves separately.
- **No tests exist** and there is no test script.
- `eslint.config.js` exists but the eslint packages are **not installed** and there is no lint script — do not claim to run lint.

## Env & secrets

- Secrets live in gitignored `.env` and `.env.local` (both contain real Supabase service-role and Google client keys). Never commit them or echo their values.
- `electron/main.js` loads `.env` via `dotenv/config`. `electron/services/googleAuthService.js` loads `.env.local` **first with `override: true`** — so `.env.local` values win for Google OAuth.
- Renderer-side API base: `import.meta.env.VITE_DATABASE_URL`, defaulting to `https://clipx.bideshi.tech` (see `src/lib/accountApi.js`).
- Google OAuth client ID/secret are fetched at runtime by the main process from `{API_BASE}/api/keys`, not read from env directly.
- Auth in the renderer uses Supabase with a custom storage adapter that persists sessions via IPC (`window.clipx.authStorage*`), falling back to `localStorage` outside Electron.

## Gotchas

- `better-sqlite3` and `keytar` are native modules and break under Electron's ABI after a fresh `npm install`. The error message in `electron/services/clipIndexService.js` tells users to run `npm.cmd run rebuild:electron`, but **that script does not exist** in `package.json`. `@electron/rebuild` is present transitively (via electron-builder); use `npm.cmd exec electron-rebuild -f -w better-sqlite3 -w keytar` (or add the missing script).
- Clip metadata lives in SQLite at `%APPDATA%/clipx/clip-index.sqlite` (WAL mode, chokidar-watched folders), plus a legacy `clipsData.json` in `%APPDATA%/`. In dev, userData is redirected to `%APPDATA%/clipx-dev`.
- FFmpeg: `ffmpeg-static` + fluent-ffmpeg; ffmpeg binary must stay unpacked (`asarUnpack`), handled by `electron/utils/ffmpeg.js` (`app.asar.unpacked` path rewrite).
- Google OAuth uses a PKCE loopback flow on port **51723**; YouTube refresh tokens are stored in the OS keychain via keytar.
- `api/` functions use `process.env.SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role — never expose to the renderer) and authenticate callers with the user's Supabase access token as a Bearer token.

## Releases

- `master` push/tag `v*` triggers `release.yml`: builds, then creates a GitHub release from the `## vX.Y.Z` section in `CHANGELOG.md` (absent section ⇒ workflow fails). Bumper version in `package.json` must match a `## vX.Y.Z` heading.
- Pushing a version bump alone (no tag) releases as `v{version}`; the `dist/latest.yml` artifact powers in-app auto-updates.

## Docs

Before writing any code concerning electron, read the following documentation:
- https://www.electron.build/docs/features/auto-update/
- https://www.electron.build/docs/api/electron-updater/
- https://www.electron.build/docs/publish/

## Code writing style

- All code should match the already established style in this repo, do not stray from a pattern that is already here.
- Do not make code too obscure and complicated, look for the simplest way to implement something while also satisfying common edge cases for the user.