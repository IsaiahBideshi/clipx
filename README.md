# ClipX

A Windows app for recording, trimming and sharing game clips with friends.

> [!WARNING]
> Still under development. Bugs may exist.

**[Download ClipX for Windows](https://github.com/IsaiahBideshi/clipx/releases/latest/download/ClipX-Setup.exe)** · [Website](https://clipx.bideshi.tech) · [Changelog](CHANGELOG.md)

ClipX updates itself when a new version is out.

## Features

**Record**
- Turn on clipping on the Recording page and press your hotkey to save the last few seconds. The hotkey works while you're in a game, even in fullscreen, but not while an app running as administrator is focused.
- Record all your screens at once, with the main recording following your mouse or the app you're using.
- Put your mic, your game and apps like Discord on their own audio tracks.
- ClipX detects the game you're playing and names the clip after it. For apps it doesn't recognize, pick the game yourself.
- A notification with a sound shows when a clip is saved.

**Edit**
- Trim clips and save them to your PC.
- Change the volume of each audio track.
- Clips of several screens show as one card. Switch between screens in the editor and save or upload any of them.

**Share**
- Upload clips with a title, game and tags for the people in them. Each clip is public, friends only or private.
- Add friends and browse their clips in the Library. Search by tag, person or game.
- Public clips get a share link anyone can watch in their browser, no ClipX needed. Links show a playable preview in Discord.

You need a ClipX account to upload clips and use the Library.

## Development

ClipX is an Electron + React app with a small API on Vercel and Supabase for accounts and data. Uploaded clips are stored in Azure Blob Storage, and recording uses a portable copy of OBS Studio that ClipX downloads itself. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.

You need Windows and Node.js 22.12 or later. In PowerShell, use `npm.cmd` instead of `npm`.

```bash
npm.cmd install
```

```bash
npm.cmd run rebuild:electron
```

```bash
npm.cmd run dev
```

`rebuild:electron` rebuilds the native modules (`better-sqlite3`, `keytar`) for Electron; run it again after every `npm install`. `dev` starts Vite and opens the app.

Without a `.env`, the app talks to the live API at `clipx.bideshi.tech`. To use another one, set `VITE_DATABASE_URL` in `.env`. The API's own secrets (Supabase service role, Azure, Google and IGDB keys) are set in Vercel.

| Command | What it does |
| --- | --- |
| `npm.cmd run dev` | Run the app with hot reload |
| `npm.cmd test` | Run the tests in `tests/` |
| `npm.cmd run build` | Build the installer into `dist/` |
| `npm.cmd run build:player` | Rebuild the share page player in `public/clip-player/` (committed) |

## Tech stack

| Part | Technology |
| --- | --- |
| Desktop app | Electron, React, Vite, MUI |
| Recording | OBS Studio (portable, driven over obs-websocket) |
| Video editing | FFmpeg |
| Accounts and database | Supabase |
| Clip storage | Azure Blob Storage |
| API and website | Vercel |
| Game data | IGDB |
