---
type: gotcha
title: The packaged companion is a new origin every launch, so localStorage never survives a restart
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: electron/main.cjs
    commitSha: 79c7889231d889ab7e30dc9aebc855f0d881c346
  - path: electron/theme.cjs
    commitSha: 79c7889231d889ab7e30dc9aebc855f0d881c346
  - path: packages/web/src/hooks/use-sidebar.ts
    commitSha: 79c7889231d889ab7e30dc9aebc855f0d881c346
createdAt: 2026-10-16
lastVerifiedAt: 2026-10-19
affectedFeatureId: feature-companion-ui
---

## Trigger

You store a preference in `localStorage` (a theme, `sidebar-collapsed`, a remembered tab) and expect it back after the packaged app is relaunched. Unit tests pass, `pnpm --filter web dev` keeps it, and the installed app forgets it on every restart.

## Context

`electron/main.cjs` serves the built UI from `createStaticProxyServer(...).listen(0, "127.0.0.1")`, so the UI lives at `http://127.0.0.1:<random port>/`. `localStorage` is per origin, and the port is part of the origin: every launch is a new origin with empty storage. jsdom has one fixed origin and the vite dev server a fixed port, so neither ever shows it.

Found by TASK-2482's real-Electron smoke (`scripts/proof-theme.cjs`): after a restart the theme came back as Auto, and the mount then echoed `system` to main, overwriting the saved `dark`. `sidebar-collapsed` (`use-sidebar.ts`) has the same defect and is still affected.

## Business rule

In the packaged app, any preference that must survive a restart cannot live only in `localStorage`. Its source of truth is the main process (a file in `app.getPath("userData")`), and the page must not write back what it just read at mount, or a stale value wins.

## Resolution

Persist in main and read it through one fixed preload function per channel (bridge rule: `a-renderer-to-os-bridge-takes-an-id-plus-a-relative-path-never-a-root-and-allowl`). TASK-2482's pattern: `electron/theme.cjs` keeps `userData/theme.json`; preload `getTheme()` (sync, `choda:get-theme`) is read by the `index.html` boot script and `useTheme` before first paint; `setTheme()` is sent only on a user choice. `localStorage` remains the browser shell's store when `window.choda` is absent. Verify with a real Electron relaunch, not a unit test.
