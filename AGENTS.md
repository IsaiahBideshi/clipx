# AGENTS.md

ClipX is a Windows Electron app (main process in `electron/`, React renderer in `src/`) plus a Vercel deployment (`clipx.bideshi.tech`) for the website, share page and API (`api/`, `api-handlers/`, `public/`). Supabase is the database and auth provider.

- How everything works: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read the section for the area you're changing before you change it.
- Database tables: [SCHEMA.md](SCHEMA.md).

## Commands

PowerShell here has execution-policy disabled, so `npm` fails; always use `npm.cmd`.

- `npm.cmd run dev`: Vite on `127.0.0.1:5173`, then Electron. Most features (IPC, keytar, better-sqlite3) need Electron open.
- `npm.cmd test`: Node's built-in runner over `tests/**/*.test.js`.
- `npm.cmd run build`: renderer + `dist/ClipX-Setup.exe` and `latest.yml`. `build:react` and `build:electron` are the two halves.
- `npm.cmd run build:player`: rebuilds the share player into `public/clip-player/`.
- `npm.cmd run rebuild:electron`: rebuilds `better-sqlite3` and `keytar` for Electron. Needed after a fresh `npm install`.
- There's no lint: `eslint.config.js` exists but eslint isn't installed. Don't claim to have run it.

## Rules

- The renderer only runs inside Electron and reaches the main process through `window.clipx.*` in `electron/preload.js`. Anything added on one side must be mirrored on the other.
- The exception is the share page player (`src/sharePlayer.jsx`, which bundles `VideoPlayer.jsx` and `playerPrefs.js`). It runs in a normal browser, so code it uses must work without `window.clipx`.
- Everything is ESM (`"type": "module"`), including `api/`.
- Secrets live in the gitignored `.env`. Never commit or echo their values, and never expose the Supabase service-role key to the renderer.
- Tests go in `tests/`, not next to the source (electron-builder packages everything under `electron/`). They may only import modules that load in plain Node: no `electron` import, no Supabase client created when the module loads (e.g. `api-handlers/auth.js`), no top-level `import.meta.env`.
- After changing `VideoPlayer.jsx`, `player.css` or `playerPrefs.js`, run `build:player` and commit `public/clip-player/`. Vercel has no build step and CI fails if it's stale.
- Change these together:
  - the stream copy blob name in `electron/utils/streamCopy.js` and `api-handlers/clips/azure.js`;
  - `OBS_VERSION` and `OBS_ZIP_SHA256` in `electron/utils/obsConfig.js` (check the new OBS for startup dialogs first).
- Don't put `[skip ci]` in PR commit messages; GitHub then skips CI for the PR.

## Docs

- Update `README.md` in the same change whenever it stops being true: a user-facing feature added, changed or removed, download or install steps, dev setup, commands or the tech stack. The README is for people using or setting up ClipX, so keep internals out of it.
- Update `docs/ARCHITECTURE.md` when you change how something it describes works, or add a part it doesn't cover. Architecture goes there, not here; keep this file to rules and commands.
- Before writing Electron code, read:
  - https://www.electron.build/docs/features/auto-update/
  - https://www.electron.build/docs/api/electron-updater/
  - https://www.electron.build/docs/publish/

## Code style

- Match the style already in the repo; don't stray from an established pattern.
- Keep code simple: the simplest way to do it that still covers the common edge cases for the user.
- When adding a feature, decide whether it should have tests, and if so add them in `tests/`.
- Clicking outside a modal closes it and doesn't click anything behind it.

## Releases

- Only cut a release (version bump, `CHANGELOG.md` section, `v*` tag) when the user explicitly asks for one.
- The `package.json` version must match a `## vX.Y.Z` heading in `CHANGELOG.md`, or the release workflow fails. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#releases).

## Pull request reviews

- Greptile doesn't reliably review on push. After pushing to a PR, comment `@greptileai` on it to trigger a re-review; closing and reopening isn't needed.
- Each trigger leaves an `@greptileai` comment on the PR under the user's account.
