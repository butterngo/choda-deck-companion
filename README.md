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

## Auto-update (TASK-1440)

Packaged builds poll a **private GitHub Releases** feed
(`butterngo/choda-deck-companion`) every 4h via `electron-updater`
(`electron/updater.cjs`, ported near-verbatim from english-companion's own
`updater.cjs`). Needs a token at `%APPDATA%/choda-companion/gh-token.txt` or
`GH_TOKEN` env — silently disabled without one, never a crash.

Test override: `CHODA_UPDATE_FEED_URL` points the updater at a plain static
file server (serving `release/latest.yml` + the installer) instead of GitHub,
for testing the check → download flow without a token.

`nsis.artifactName` is set explicitly
(`choda-companion-setup-${version}.${ext}`) — **do not remove this.** Without
it, electron-builder's default NSIS filename includes spaces
(`productName`), while `latest.yml`'s asset reference does not, so every real
auto-update would 404 downloading the new version. Caught by actually
building the installer and diffing the two filenames, not by inspection.

## Cutting a release (TASK-1441) — `pnpm run dist:publish`

1. Bump `version` in `package.json` (semver). No pre-release/draft staging in
   v1 — `--publish always` publishes the GitHub Release immediately and every
   installed client with a token picks it up within the next 4h poll (or
   sooner if the app is relaunched). Revisit if staged rollout is ever needed.
2. Authenticate electron-builder's publish step — it needs a `GH_TOKEN` (or
   `GITHUB_TOKEN`) env var with `repo` scope for `butterngo/choda-deck-companion`
   at publish time (separate concern from the *installed app's* own
   `gh-token.txt`, which is read-only and used only to check for updates).
3. Run `pnpm run dist:publish`. This builds, vendors the adapter, packages,
   and uploads the installer + `latest.yml` to a new GitHub Release in one
   step.
4. Verify the release landed:
   `gh release view v<version> --repo butterngo/choda-deck-companion`.

### Recovery from a failed/partial publish

A network drop mid-upload can leave a GitHub Release with a missing or
inconsistent `latest.yml` — every installed client's updater would then
either see nothing new or fetch a broken artifact set. Recovery:

1. `gh release delete v<version> --repo butterngo/choda-deck-companion --yes`
   (delete the incomplete release; this does **not** touch any other
   version or any installed client — nothing auto-updates from a deleted
   release, they just keep polling and find nothing new).
2. Re-run `pnpm run dist:publish` for the same version. electron-builder
   regenerates and re-uploads both the installer and `latest.yml` together,
   so a clean re-publish can't leave the same partial state twice.
