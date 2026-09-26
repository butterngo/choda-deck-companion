---
type: learning
title: electron-builder --publish always can create two draft releases for one version and split the assets
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: package.json
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
  - path: scripts/verify-release-manifest.mjs
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
createdAt: 2026-09-25
lastVerifiedAt: 2026-09-26
---

**Trigger:** you are cutting a companion release with `pnpm run dist:publish`. **Expect this on every run**, not only when something looks wrong: it happened on 0.18.0 and again on 0.18.1 (2026-09-25/26), both times with exit 0 and a passing `verify-release-manifest`. Symptoms are a release missing the `.exe` or `latest.yml`, or two drafts for one version (the two `0.15.0` drafts from 2026-09-18 are very likely this too).

**Context.** The log prints `creating GitHub release reason=release doesn't exist tag=v<ver>` **twice**. The parallel upload tasks each find no release yet and each create one. The result is two draft releases with the same tag, and the assets split between them the same way both times:

- draft A: `choda-companion-setup-<ver>.exe.blockmap` only
- draft B: `choda-companion-setup-<ver>.exe` + `latest.yml`

`gh release view v<ver>` shows only ONE of them, so the release looks half-empty rather than duplicated. `verify-release-manifest` checks the files on disk, not the release, so it cannot catch this.

**Business rule.** After `dist:publish`, list every release for the tag through the API rather than `gh release view`:

    gh api repos/butterngo/choda-deck-companion/releases \
      --jq '.[] | select(.tag_name=="v<ver>") | "\(.id) draft=\(.draft) \([.assets[].name])"'

Exactly one release must hold all three assets (installer, blockmap, `latest.yml`), with sizes matching `release/`.

**Resolution (the manual fix used twice).** Upload the missing asset to the release that holds the installer and `latest.yml` (`POST uploads.github.com/.../releases/<id>/assets?name=...`). Delete the other draft by id (it holds nothing unique once its asset is re-uploaded). Then publish with `PATCH .../releases/<id>` `draft=false make_latest=true`. Confirm with `gh api .../releases --jq '[.[]|select(.tag_name=="v<ver>")]|length'` = 1, and check the auto-update feed with `curl -sL https://github.com/<repo>/releases/latest/download/latest.yml`.

**Not yet done:** fix it at the source. For example, create the release (draft) before electron-builder uploads so both tasks find it, or publish with `--publish never` and upload the three files with `gh release create`. Until then the manual consolidation is part of every release.

Related, and a different failure: `dist-publish-can-leave-a-stale-latest-yml-that-silently-kills-auto-update` (a stale `latest.yml` after a failed publish).
