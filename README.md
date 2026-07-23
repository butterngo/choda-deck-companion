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
