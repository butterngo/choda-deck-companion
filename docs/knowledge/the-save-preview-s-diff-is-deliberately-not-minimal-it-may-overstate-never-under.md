---
type: gotcha
title: The save preview's diff is deliberately not minimal — it may overstate, never understate
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/lib/line-diff.ts
    commitSha: 21f9c9611f14d3e7093019c91316266cfb49d64a
createdAt: 2026-09-05
lastVerifiedAt: 2026-09-05
affectedFeatureId: feature-companion-ui
---

**Trigger:** you read `line-diff.ts`, see that it trims a common prefix and suffix and calls everything between them changed, and reach for a real LCS diff to "fix" it.

**Context.** The preview exists to answer one question before a write: *does this save change only what I changed?* It backs the claim the whole edit feature rests on, and it is the UI half of TASK-1849's human check.

**The rule.** The simplification is chosen for a safety property, not for laziness:

> It can report a change a minimal algorithm would have matched up. It can **never** report **fewer** changes than there are.

A preview that overstates is mildly annoying — you see a line marked that did not really move. A preview that understates lets a line through **unseen**, which is precisely the failure it was built to prevent. Replacing it with a minimal diff is only safe if the replacement provably keeps that direction.

For the edit this actually serves — a person fixing one line of a config file — prefix/suffix trimming already yields exactly one removed and one added line.

**Line endings are kept, and that is load-bearing.** These files are CRLF. A diff that normalised them would mark every line changed, which is the exact defect the preview is meant to catch, and the reader would learn to ignore the preview. A test pins an unchanged CRLF file at zero changes.

**The honest limit, stated in its own CONTROL test.** A change of **line endings alone** is invisible here: same visible text, different bytes, zero reported changes. The preview cannot see it and does not pretend to. The adapter's byte-level round trip (TASK-1841 AC-5) is what actually guards that case.

**Resolution.** Save proposes; a second press writes, carrying the same `if-match`. Cancel writes nothing and keeps the draft. An unchanged buffer disables the write — a `PUT` that changes no lines still costs a request and a new hash for nothing.
