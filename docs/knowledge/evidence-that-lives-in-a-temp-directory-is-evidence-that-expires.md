---
type: learning
title: Evidence that lives in a temp directory is evidence that expires
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: scripts/proof-loopback.cjs
    commitSha: 085f9a7da9b07f417b9735af40a90389647b1694
createdAt: 2026-09-16
lastVerifiedAt: 2026-09-16
---

**Trigger:** a script is the *only* thing standing behind a claim — an acceptance
criterion nothing else can verify, or the spike that got an ADR accepted — and you
write it to `C:\tmp` because it is a throwaway. It is not a throwaway. It is the
evidence.

**Context, with the receipt.** `adr-006-watch-audio-capture-persist-shared-tab-audio`
(english-companion) was accepted on the strength of a spike that recorded, decoded and
played back audio in the real Electron runtime. The ADR names it:
`Proof: C:\tmp\proof-1231.mjs (Electron, green)`. Three months later TASK-1964 needed
the same question answered for a different repo and went looking for it. The file is
gone. Nothing in the ADR is recoverable — not the method, not the measurements, not
the thresholds — so the proof had to be rebuilt from scratch, and the ADR's citation
now points at nothing while still reading as though it points at something.

That last part is the real damage. A dead citation does not announce itself. It looks
exactly like a live one until someone tries to follow it.

**Rule.** If a script is the sole evidence for an acceptance criterion, an ADR, or a
spike's conclusion, **it lives in the repo**, versioned alongside the claim it
supports. A temp path in a durable document is a broken link with a delay fuse.

**Resolution in this repo.** `scripts/proof-loopback.cjs` + `scripts/proof-loopback.html`
are committed for this reason, and `eslint.config.js` grew a `scripts/**/*.cjs` block
so a committed Electron-main script passes the same gate as everything else. They live
in `scripts/`, not `electron/`, because `electron/**` is packaged into the installer
and a proof script has no business shipping to users.

**Corollary for the writer of the ADR:** cite a repo-relative path, never an absolute
one. `C:\tmp\…` and `C:\Users\<name>\…` are both unreachable from any other machine,
including this one next year.
