# TASK-2482 — Auto / Light / Dark theme switch: AC verification

Date: 2026-10-16. Branch `feat/task-2482-theme-switch-sidebar`.

## Gates (AC-8)

| Gate | Result |
|---|---|
| `pnpm run lint` | exit 0 |
| `pnpm run typecheck` | exit 0 |
| `pnpm test` | exit 0 — web 100 files / 896 tests, electron 13 files / 179 tests |
| `pnpm run build` | exit 0 |

## Real-Electron smoke (AC-1 … AC-7)

`task-2482/smoke-theme.cjs` drives the real `electron/main.cjs`, preload and
built web UI through Playwright's `_electron`, flips the real Windows app theme
(`AppsUseLightTheme` + a `WM_SETTINGCHANGE "ImmersiveColorSet"` broadcast) and
restores it, and samples the native title bar's pixel colour from the screen.
Result: **12/12 passed** — [`task-2482/smoke-output.txt`](task-2482/smoke-output.txt).

| AC | What the smoke proved |
|---|---|
| AC-1 | Fresh profile: Auto checked, page light, `themeSource=system` |
| AC-2 | Dark → `.dark` + `themeSource=dark`; Auto → key removed, OS theme applied |
| AC-3 | After a restart the window is created with `backgroundColor #18181B` and `themeSource=dark` (read from `userData/theme.json`), Dark is still selected, and `.dark` is already on `<html>` when the parser reaches the app's first module script |
| AC-4 | In Auto, Windows → dark flips page, `prefers-color-scheme` and title bar live; back to light flips back. In Light, Windows → dark changes nothing |
| AC-5 | Title bar pixel `#f2f4ed` (light) → `#20211e` after choosing Dark; `window.choda.setTheme("purple")` returns `{ ok: false }` and `themeSource` stays `dark` |
| AC-7 | Collapsed rail: one button, labels cycle Light → Dark → Auto → Light |

## Defect the smoke found (fixed before release)

The first smoke run failed AC-3: after a restart the app came back in Auto. The
packaged UI is served from `127.0.0.1` on a **new port every launch**, so every
launch is a new origin with an empty `localStorage` — the key the boot script
read was always gone, and the mount then echoed `system` back to main,
overwriting the saved `dark`. Unit tests could not see this (jsdom has one
origin). Fix: main's `userData/theme.json` is the source of truth in the
packaged app, read synchronously through a second fixed preload function
`getTheme` (channel `choda:get-theme`) by both the boot script and `useTheme`;
`localStorage` remains the browser shell's store, and main is told only on a
user choice, never on mount.

The same origin change means `sidebar-collapsed` (and any other `localStorage`
preference) is not remembered across launches in the packaged app. Out of scope
here; noted as a follow-up.

## Harness notes

- Run from a scratch copy of `task-2482/`, with a copy of the database under
  `data/database/`. `wrapper/` sets its own `userData` so the dev instance does
  not collide with an installed Companion's single-instance lock (both default
  to `%APPDATA%\choda-deck-companion`).
- The sibling `choda-deck` checkout's `better-sqlite3` is built for Node and
  fails under Electron (`NODE_MODULE_VERSION 137` vs `132`), so the harness
  points `CHODA_ADAPTER_ENTRY` at the last packaged build's vendored adapter.
- Playwright emulates `prefers-color-scheme: light` by default; the harness
  turns that off (`emulateMedia({ colorScheme: null })`), otherwise Auto looks
  broken when it is not.
