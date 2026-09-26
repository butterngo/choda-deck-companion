---
type: gotcha
title: A renderer-to-OS bridge takes an id plus a relative path, never a root, and allowlists what it opens
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: electron/preload.cjs
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
  - path: electron/open-folder.cjs
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
  - path: electron/open-html.cjs
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
  - path: electron/main.cjs
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
createdAt: 2026-09-26
lastVerifiedAt: 2026-09-26
affectedFeatureId: feature-companion-ui
---

## Trigger

Adding a third function to `electron/preload.cjs`: open a file, reveal in Explorer, launch an editor or tool. Or loosening `open-folder` / `open-html` to fix a case they refuse.

## Context

The window runs with `contextIsolation` on and `nodeIntegration` off. Its preload is the renderer's only way into the main process. Two bridges exist, both built on purpose the same way:

- `choda:open-folder` (TASK-2050): directories inside the vault only.
- `choda:open-html` (TASK-2145): `.html`/`.htm` inside a workspace, opened in the default browser.

`shell.openPath` / `shell.openExternal` hand a file to whatever the OS associates with it. For an `.exe`, `.bat` or `.lnk`, that means **running it**. A bridge that opens files is one missing check away from being a remote launcher.

## Business rule

1. **The renderer never names a root.** It sends an identifier (vault implicit, or a `workspaceId`) plus a path relative to it. The main process resolves the root from its own configuration or from the adapter, using the bridge token it holds.
2. Absolute and drive-lettered paths are **refused**, not checked.
3. After `path.resolve(root, rel)`, the target must still be inside the root (`isInside`). A relative path can carry `..`.
4. The type allowlist (directory, `.html`/`.htm`) is checked on the **resolved** target, so `report.html/../payload.bat` cannot pass on its original string.
5. The target must exist and be the right kind (a directory for open-folder, a regular file for open-html).
6. Every refusal returns `{ ok:false, reason }`, and the UI shows the reason.
7. The preload exposes a fixed set of named functions, one fixed channel each. Never `ipcRenderer`, never a generic invoke.

## Resolution

Build the new bridge as `electron/<name>.cjs` with an injectable `shell` and root resolver, following `open-html.cjs`. Test it the way `open-html.test.cjs` does: every refusal asserts `ok:false` **and** zero shell calls, and injection-check that removing the allowlist or the containment check turns tests red. Extend `preload.test.cjs` so the exposed key list stays exact. In the UI, render the control only when `window.choda.<fn>` exists; the browser shell has no preload.
