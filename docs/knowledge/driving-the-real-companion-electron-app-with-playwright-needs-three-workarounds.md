---
type: learning
title: Driving the real companion Electron app with Playwright needs three workarounds
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: scripts/proof-theme.cjs
    commitSha: 79c7889231d889ab7e30dc9aebc855f0d881c346
  - path: scripts/proof-theme/wrapper-main.cjs
    commitSha: 79c7889231d889ab7e30dc9aebc855f0d881c346
createdAt: 2026-10-16
lastVerifiedAt: 2026-10-19
---

## Context

TASK-2482 proved the theme switch on the real `electron/main.cjs` + preload + built UI through Playwright's `_electron` (`scripts/proof-theme.cjs`). Three things made the first runs fail for reasons unrelated to the code under test. Each one looks like a product bug.

## 1. An installed Companion silently quits the dev instance

The installed app and a dev `electron .` both default to `%APPDATA%\choda-deck-companion` as `userData`, so they share the single-instance lock. With the installed app running, the dev instance loses `requestSingleInstanceLock()` and quits with **exit 0** (Playwright reports "Target page, context or browser has been closed"). Fix: launch a wrapper that calls `app.setPath("userData", <scratch>)` before requiring `electron/main.cjs` (`scripts/proof-theme/wrapper-main.cjs`).

## 2. The dev adapter fails to boot under Electron

Unpackaged, the adapter is `../choda-deck/dist/companion-server.cjs` run with Electron's Node (`ELECTRON_RUN_AS_NODE`). The sibling checkout's `better-sqlite3` is built for plain Node (`NODE_MODULE_VERSION 137` vs Electron's `132`), so the app shows "The local adapter failed to boot: adapter exited during boot (code 1)". Fix: point `CHODA_ADAPTER_ENTRY` / `CHODA_ADAPTER_NODE_PATH` / `CHODA_EMBEDDING_MODEL_DIR` at `release/win-unpacked/resources/adapter/`, which is built for Electron. Use `CHODA_DATA_DIR` with a copy of the database so the run never touches live data.

## 3. Playwright forces a light colour scheme

Playwright emulates `prefers-color-scheme: light` by default, also for Electron. `matchMedia("(prefers-color-scheme: dark)")` then stays `false` even when `nativeTheme.shouldUseDarkColors` is `true`, and "Auto follows Windows" looks broken when it is not. Fix: `page.emulateMedia({ colorScheme: null })` right after `firstWindow()`.

## Also useful

- A real Windows theme flip: set `HKCU\...\Themes\Personalize\AppsUseLightTheme` and broadcast `WM_SETTINGCHANGE` with `"ImmersiveColorSet"`; restore it at the end.
- The native title bar is not in `page.screenshot()`; sample a pixel from the screen between `getBounds().y` and `getContentBounds().y`.
