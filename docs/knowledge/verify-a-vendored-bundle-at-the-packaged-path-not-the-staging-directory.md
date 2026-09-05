---
type: learning
title: Verify a vendored bundle at the packaged path, not the staging directory
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: scripts/vendor-adapter.mjs
    commitSha: 21f9c9611f14d3e7093019c91316266cfb49d64a
createdAt: 2026-09-05
lastVerifiedAt: 2026-09-05
---

**Trigger:** a release is verified as "the adapter was vendored correctly", the installer ships, and the installed app still answers 404 on a route the bundle demonstrably contains.

**Context.** `pnpm run vendor:adapter` copies `choda-deck/dist/companion-server.cjs` into `electron/vendor/`. That is **staging**. What the app loads is `resources/adapter/companion-server.cjs` inside the packaged output, and electron-builder's `extraResources` mapping sits between the two.

Comparing the staging copy proves the **vendor script ran**. It does not prove the **release carries the bytes** — and the mapping in between is exactly where a rename, a filter or a dropped path segment would hide. That mapping has already surprised this repo once: the matcher silently drops a literal `node_modules` segment from a source path, which is why the staged deps directory is renamed to `deps` before packaging.

**The rule.** Verify at the path the installed app reads:

```
cmp choda-deck/dist/companion-server.cjs \
    release/win-unpacked/resources/adapter/companion-server.cjs
```

and grep *that* file for the route strings the release claims to add. Do the staging comparison too if you like — it localises a failure — but it is never the evidence.

**Applied.** 0.9.6 through 0.9.9 were each proven this way: `cmp` exits 0 at both paths, all three share one sha256, and the packaged bundle is grepped for the routes. TASK-1849 AC-1 is worded to require the packaged path specifically.

**Why this keeps needing saying.** A new adapter route is invisible to the packaged app until a release re-vendors the bundle (INBOX-1888). So the failure mode is not "the code is wrong" — the code is right, merged, and green in CI. It is "the code is not in the thing you installed", and every signal short of the packaged bytes says everything is fine.
