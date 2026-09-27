---
type: decision
title: Publish companion releases as a draft, then flip them only after GitHub confirms the release
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: package.json
    commitSha: 
  - path: scripts/release-guards.test.mjs
    commitSha: 
createdAt: 2026-09-27
lastVerifiedAt: 2026-09-27
---

## Decision

`build.publish.releaseType` in `package.json` is set explicitly to `"draft"` (TASK-2052 AC-1). electron-builder uploads into a draft; a later post-publish step checks the tag's state **on GitHub** and only then flips the release to published (`draft=false`, `make_latest=true`).

The value happens to equal electron-builder's default. It is written down anyway so the behaviour is declared rather than inherited, and `scripts/release-guards.test.mjs` asserts it so that deleting the key cannot pass silently.

## Why not `"release"`

`"release"` would make every upload live the moment electron-builder creates the release. Two recorded failure modes make that unsafe for the auto-update feed:

- **Assets upload in parallel and can drop.** v0.6.1 lost the 100 MB installer to a DNS failure while the blockmap and `latest.yml` landed (see `dist-publish-can-leave-a-stale-latest-yml-that-silently-kills-auto-update`). Published immediately, the feed would point clients at a `latest.yml` whose installer is not attached.
- **The publisher races itself into two releases per tag.** Two publisher instances each find no release and each create one, splitting `.exe` + `latest.yml` from `.exe.blockmap` (see `electron-builder-publish-always-can-create-two-draft-releases-for-one-version-an`). Seen on 0.13.0, 0.15.0, 0.17.0, 0.18.0 and 0.18.1. With `"release"` both halves would be public.

A draft is the quarantine: nothing reaches `electron-updater` until one release on the tag carries all three assets.

## What this does not mean

It does not mean releases stay drafts. The earlier failure (auto-update dead since v0.8.0) came from the draft default combined with **no** un-draft step. The flip is now part of the pipeline and gated on the GitHub check, not left to a manual habit.

## Rejected alternatives

- `"release"` — rejected for the reasons above.
- `"prerelease"` — `electron-updater` skips prereleases unless `allowPrerelease` is set, so it reproduces the dead feed with a different label.
