---
type: learning
title: "dist:publish can leave a stale latest.yml that silently kills auto-update"
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: package.json
    commitSha: 1ad72430e9d4b7ee03fd691731bb5bacc4023c2b
  - path: scripts/verify-signature.mjs
    commitSha: 1ad72430e9d4b7ee03fd691731bb5bacc4023c2b
createdAt: 2026-08-15
lastVerifiedAt: 2026-08-15
---

## Trigger

Cutting a companion release, or recovering from a `pnpm run dist:publish` that
failed partway. Also: "the release page looks right, why isn't auto-update
picking it up?"

## What happens

`dist:publish` is `build → vendor:adapter → electron-builder --win --publish
always → verify:signature`. The publish step is **not atomic**, and its failure
mode leaves a booby-trapped file behind.

Observed cutting v0.6.1 (2026-08-15): `GH_TOKEN` was unset. electron-builder
built the installer, signed it, wrote the blockmap — and then failed on
`GitHub Personal Access Token is not set`. It never reached the point where it
regenerates `release/latest.yml`.

The directory afterwards:

    choda-companion-setup-0.6.1.exe        (new, correct)
    choda-companion-setup-0.6.1.exe.blockmap (new, correct)
    latest.yml                              ← still v0.6.0's

That `latest.yml` is **well-formed**. It parses, it has a valid sha512, it names
`choda-companion-setup-0.6.0.exe`. Upload it alongside the 0.6.1 assets and every
auto-updating client resolves an asset that does not exist in that release. No
error is raised anywhere in the pipeline — the manifest is not corrupt, it is
merely describing a different version.

A second, unrelated failure hit the same release: `gh release upload` dropped the
100 MB exe on `dial tcp: lookup uploads.github.com: no such host`, while the
103 KB blockmap and the 359-byte `latest.yml` both landed. A partially-populated
release is the normal outcome of a flaky upload, not an exotic one.

## Business rule

**Never trust `release/latest.yml` after a failed publish.** The manifest and the
installer are written by different steps, so they can disagree while both look
valid. The release is correct only when the manifest's `version`, `path` and
`size` match the exe actually attached to the tag.

## Resolution

1. Re-run the publish with a token — `export GH_TOKEN=$(gh auth token)` — which
   regenerates `latest.yml` properly. Don't hand-edit it; the sha512 must match
   the bytes.
2. Before flipping the draft, verify asset-by-asset:

       gh release view v<x.y.z> --json assets --jq '[.assets[]|{name,size,state}]'
       cat release/latest.yml

   All three assets present, `state: uploaded`, and the exe's byte size equal to
   the `size` in `latest.yml`. For v0.6.1 that was `100179523` on both sides.
3. `gh release upload --clobber` is the reliable path for the 100 MB exe when
   electron-builder's own publisher drops it. Retry on network failure — the
   earlier partial upload does not need cleaning up first.
4. `node scripts/verify-signature.mjs` runs even on an unsigned build and exits 0;
   it *reports* rather than gates. Read its output — every release since 0.4.0
   ships UNSIGNED, and that belongs in the release notes.

## Related

- `releasing-english-companion-the-publish-step-can-silently-kill-auto-update`
  (english-companion) — the same failure class in another repo, found first there.
  Two projects, one pipeline shape: worth treating as a property of
  electron-builder publishing, not of either app.
- v0.6.1 / TASK-1597 — where this was hit and worked around by publishing with
  `gh` instead.
