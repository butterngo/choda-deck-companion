# Choda Companion

Companion application for managing the **choda-remote** knowledgebase.

> Reset to a clean slate. The previous web + mobile UI implementation was
> removed because it was built against the wrong requirement. New scope:
> a client application for managing the choda-remote knowledgebase.

## Status

Greenfield — implementation pending. Architecture/decision history for the
broader choda-deck product lives in the `choda-deck` knowledge store, not here.

## Desktop shell (Electron, TASK-1435+)

`pnpm run electron:dev` builds `packages/web` and launches the Electron shell,
which spawns the companion adapter (`src/adapters/companion/`, built to
`dist/companion-server.cjs` in the **sibling `choda-deck` checkout**) as a
child process and serves the built UI + a same-origin `/api` proxy to it — no
changes to `packages/web`'s own `/api`-relative fetch code between dev,
browser-only, and packaged runs.

Prerequisite: `choda-deck`'s `dist/companion-server.cjs` must already be built
(`pnpm run build:companion` in that repo) — the Electron shell does not build
it for you. Override its location with `CHODA_ADAPTER_ENTRY`, and the data
directory with `CHODA_DATA_DIR`, if you need non-default paths.

## Packaging (TASK-1438) — `pnpm run dist`

Builds the web UI, **vendors** the adapter + its runtime dependency closure
from the sibling `choda-deck` checkout into `electron/vendor/` (a build
artifact, gitignored — see `scripts/vendor-adapter.mjs`), then runs
`electron-builder` to produce a Windows NSIS installer in `release/`.

Vendored at present: `better-sqlite3` + `bindings` + `file-uri-to-path` (its
runtime dep chain) and `sqlite-vec` + `sqlite-vec-windows-x64` — both required
unconditionally at module load, not just when embedding search is used. NOT
vendored: `@huggingface/transformers` / `onnxruntime-*` / `sharp` — reached
only by the embedding-provider call path, which already degrades gracefully
(`GET /knowledge/search` returns `{enabled:false, reason}`); a packaged app
runs with search in that disabled state until a follow-up vendors those too.

The vendored copy is deliberately placed at `electron/vendor/deps/<pkg>`, not
`electron/vendor/node_modules/<pkg>` — electron-builder's `extraResources`
file-matcher silently drops any nested `node_modules` directory, so the
adapter's `NODE_PATH` is pointed at `deps` directly instead
(`adapter-launcher.cjs`'s `resolveNodePath`).

Installing over an existing install upgrades in place (NSIS `oneClick`);
uninstalling does **not** delete `CHODA_DATA_DIR`
(`nsis.deleteAppDataOnUninstall: false`), which in a packaged build defaults
to `<userData>/data` — the SQLite DB and its contents survive an uninstall.

## Auto-start at login (TASK-1439)

Packaged builds register a per-user Windows login item
(`app.setLoginItemSettings`, `electron/login-item.cjs`) on every launch —
same mechanism english-companion already uses, not the Task Scheduler
`AtLogOn` trigger the standalone adapter service used. Registered under the
name `Choda Companion`; visible and independently toggleable in Windows
Settings → Startup Apps. Dev runs never register (`app.isPackaged` guard) —
otherwise every `pnpm run electron:dev` would auto-start `electron.exe .`.

Uninstalling removes the Run-key entry via a custom NSIS uninstall macro
(`build/installer.nsh`) — Electron's own login-item API only sets/reads state
at runtime, so without this the uninstaller wouldn't know to clean it up.
