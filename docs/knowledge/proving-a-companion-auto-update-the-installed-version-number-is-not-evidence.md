---
type: learning
title: "Proving a companion auto-update: the installed version number is not evidence"
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: electron/updater.cjs
    commitSha: 
  - path: electron/main.cjs
    commitSha: 
createdAt: 2026-09-27
lastVerifiedAt: 2026-09-27
---

**Trigger:** an acceptance criterion or a bug report says "the installed app auto-updated to vX". Or you are waiting for an update that never arrives.

**Context.** On 2026-09-27 (TASK-2052 AC-6) the machine showed 0.18.2 installed. It looked like proof, and it was not. The installer had been run by hand from the local `release/` folder. A second attempt then waited five minutes with nothing happening, because the updater was switched off.

## Business rule

Only the updater's own artifacts prove an update came through the updater. A version number looks the same however the version got there.

- **`%LOCALAPPDATA%\choda-deck-companion-updater\pending\update-info.json`** is written only by electron-updater, next to the downloaded installer. It holds the file name and a sha512, which must match `latest.yml` on the feed.
- **A downloaded file gets a fresh mtime.** electron-builder's NSIS installer copies *itself* into `…-updater\installer.exe` and keeps its original mtime. So if that cache file's mtime equals the build file's mtime to the millisecond, the installer was run by hand. That is how the first attempt was caught (both files read `17:39:49.575`).
- **GitHub `download_count` is not usable.** It stayed at 0 for the installer even after a real, verified updater download over the API with a token.

## Before waiting on an update, check it can happen at all

- **The updater needs `%APPDATA%\choda-deck-companion\gh-token.txt` until TASK-2164 ships.** Without it, `electron/updater.cjs` returns `no_token` after a `console.log`, which is invisible in a packaged app. No `pending\` folder ever appears. The repo is public, so the requirement is a leftover from when it was private.
- **The token is read only at app start.** Closing the window leaves the app running in the tray. Quit from the tray menu.
- **"Was the app restarted?" must read the MAIN process.** The vendored adapter also runs as `Choda Companion.exe` (ELECTRON_RUN_AS_NODE), next to gpu, renderer and utility children. Filter by command line: the main process has no `--type=` flag and no adapter path. Sorting processes by start time can show an old child.
- **A slow download is the network, not the app.** Fetch a small asset (the `.blockmap`) directly to compare. electron-updater does not resume, so quitting mid-download starts it over.

## Resolution — the evidence to record

The version before and after (exe `ProductVersion` plus the registry uninstall entry), when `pending\` appeared, the downloaded file's size and sha512 against the feed, the `update-info.json` content, and the relaunch time of the main process.
