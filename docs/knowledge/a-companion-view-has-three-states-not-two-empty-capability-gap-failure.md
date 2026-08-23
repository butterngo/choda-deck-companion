---
type: gotcha
title: "A companion view has three states, not two: empty, capability-gap, failure"
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/components/state/EmptyState.tsx
    commitSha: 27c87082304c0a7f92c3260cf7feaefafbd41faf
  - path: packages/web/src/components/state/CapabilityNote.tsx
    commitSha: 27c87082304c0a7f92c3260cf7feaefafbd41faf
  - path: packages/web/src/components/state/ErrorState.tsx
    commitSha: 27c87082304c0a7f92c3260cf7feaefafbd41faf
  - path: packages/web/src/components/state/Skeleton.tsx
    commitSha: 27c87082304c0a7f92c3260cf7feaefafbd41faf
  - path: packages/web/src/components/TaskProvenance.tsx
    commitSha: 27c87082304c0a7f92c3260cf7feaefafbd41faf
createdAt: 2026-08-15
lastVerifiedAt: 2026-08-23
affectedFeatureId: feature-companion-ui
---

> **The title undercounts.** It says three; there are four. The fourth was found
> in TASK-1748 and added here rather than filed separately, because it is the
> same failure — a middle case collapsing into a neighbour. Titles are immutable
> on update, so this line carries the correction instead.

## Trigger

Adding or reviewing a state branch in any companion view — anywhere the pane
renders something other than its data.

## Context

Companion views resolve into more outcomes than "data" and "broken", and the
middle cases are the ones that get collapsed. Four distinct things have been
conflated across the pillars at different times:

1. **Empty** — the adapter was reached and answered with nothing.
2. **Capability gap** — a provider is switched off server-side. The request was
   answered correctly; the capability simply isn't there.
3. **Failure** — unreachable adapter, or a query that errored.
4. **Undeterminable** — the request succeeded and the answer is legitimately
   empty, but that emptiness is an artefact of a **recording gap**, not a fact
   about the world.

`GraphboardView` had no empty branch at all until TASK-1597. A reachable API
answering with zero nodes fell straight through to a blank canvas that looked
identical to a broken one, so "nothing recorded for this project yet" and "the
graph is broken" were the same pixels.

The same family already bit once from the other direction: a **401** from the
token-gated vault route reported *"Can't reach the laptop API"* in five views at
once, which is why `ErrorState` gained the `unreachable` / `failed` split in
`4466fd3` (PR #58).

**The fourth state (TASK-1748).** Task detail answers "which files did this task
change" from `task_code_refs`. Editing through a Bash heredoc or `sed` bypasses
the `file_modified` hook, so `session_end` derives **zero** TOUCHES — and a task
with real commits and an empty modifies set is indistinguishable from one that
changed nothing. Rendering "Changed no files" there is not an empty state; it is
a false statement, produced confidently. Commits are the evidence that work
happened, so commits-with-zero-TOUCHES is the tell.

Note what it is *not*: not **empty** (the emptiness is not the truth), not a
**capability gap** (nothing is switched off), not a **failure** (nothing errored).
It needs its own branch or it lands in the wrong one — and the wrong one here is
the dangerous direction, because "changed nothing" reads as a finding.

## Business rule

**Empty and unreachable must never render the same thing; a switched-off provider
is a gap rather than an error; and an emptiness you cannot vouch for must say so
instead of being reported as a result.**

A capability note sits *above* content that keeps rendering; an error *replaces*
it. Choosing the wrong one either hides working data behind a red box, or dresses
a real failure up as an ordinary absence. The fourth case adds: an absence whose
provenance is unknown is not a result at all.

## Resolution

- **Empty** → `EmptyState`, with copy naming what would appear here and how it
  gets there.
- **Capability gap** → `CapabilityNote`, neutral zinc, rendered above content that
  still works. Graph search disabled server-side does not stop the graph drawing.
- **Failure** → `ErrorState`, `variant="unreachable"` for `conn === "disconnected"`,
  `variant="failed"` for a query error.
- **Undeterminable** → `CapabilityNote` as well, never `ErrorState`: nothing
  failed and the surrounding data is still complete. `TaskProvenance.tsx` renders
  "Couldn't determine which files changed" when `filesConfidence` is
  `undeterminable`, and the plain "Changed no files" only when there are no
  commits either.
- **Loading** → `Skeleton`, never a bare paragraph of state text.

Assert these branches by the primitive's own `data-testid`, not by its copy. A
view that regressed to a bare `<p>` would render identical words and sail past a
text assertion — the test would confirm only that the sentence still exists,
which was never the property worth protecting. See
`packages/web/src/views/__tests__/graph-search-capture-states.test.tsx`.

**Every one of these branches needs a paired control test.** A check that fires on
the undeterminable case proves nothing unless a sibling test proves it does *not*
fire on the genuinely-empty one — otherwise the implementation passes by warning
about everything, which is the same lie wearing a different coat. See
`packages/web/src/views/__tests__/task-provenance.test.tsx`.

## Related

- `companion-screens-must-render-honest-liveness-never-fake-live` — adjacent, and
  about staleness rather than absence. The two together cover "is this real?" and
  "is this nothing?"
- TASK-1597 (`a6ec575`, v0.6.1) — Graph, Search and Capture; PR #58 `4466fd3` —
  the unreachable/failed split.
- TASK-1748 (`26e250e`, PR #67) — the fourth state; TASK-1751 (`82b3806`) records
  the same distinction at the data layer, so the view is not the only place that
  knows.
