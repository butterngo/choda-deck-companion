---
type: gotcha
title: A detail pane must not be the scrolling element — the header travels with the content
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/views/WorkspaceView.tsx
    commitSha: 91a5da962ec766f469142d6512fc0591acfa4d38
  - path: packages/web/src/components/CommitFileView.tsx
    commitSha: 91a5da962ec766f469142d6512fc0591acfa4d38
  - path: packages/web/src/views/WorkspaceDocsView.tsx
    commitSha: 91a5da962ec766f469142d6512fc0591acfa4d38
createdAt: 2026-09-03
lastVerifiedAt: 2026-09-03
affectedFeatureId: feature-companion-ui
---

## Trigger

A pane shows a header above long content — a file path, sibling-file chips, a close button,
a "back" control — and a reader reports that the way back "disappears", or that returning
from a detail lands them somewhere in the middle of it. Every test is green; the control is
present in the DOM the whole time.

## Context

TASK-1786. The History tab's commit detail pane carried `overflow-y-auto` on the pane
itself. `CommitFileView` was written for the right structure — a header row, then
`<div className="min-h-0 flex-1 overflow-y-auto">` around the source — but its root had no
bounded height, and `flex-1` inside a scrolling parent resolves to the content's own
height. The inner container therefore never scrolled; the pane did.

The consequence was invisible to the suite and obvious to a person: scroll a few hundred
lines into a file and the path, the chips and "Back to diff" have all left the screen. The
only route back to the commit was scrolling the whole file up again. The close button on
the diff had the same problem, `absolute top-2` inside a container that scrolls away from
its own top.

## Business rule

**The pane is a non-scrolling column; its children own the scroll.** Concretely:

- the pane: `flex min-h-0 flex-col overflow-hidden`
- anything that must stay put: `flex-none` (or simply not inside the scrolling child)
- the long content: `min-h-0 flex-1 overflow-y-auto`

`min-h-0` is load-bearing, not decoration — without it a flex child refuses to shrink below
its content and the scroll silently relocates to the nearest scrollable ancestor.

`WorkspaceDocsView` established this shape. When a second pane needs it, copy it rather
than reaching for `position: sticky`: there is no `sticky` anywhere in this repo, and
adding one would be a second pattern for a problem that already has a solved one.

## Resolution

Bound the height **at the pane**, not at the child. `CommitFileView` needed only `flex-1`
on its root once the pane stopped scrolling — its inner scroll container was already
correct and had been inert.

A side effect worth knowing, because it is the real argument against `sticky`: with two
independent scroll containers, leaving a file and returning to the diff no longer restores
a stale scroll position. A sticky header would have fixed the visible symptom and left that
one in place.

Verify it structurally — see the companion gotcha "jsdom has no layout engine". Walk
`parentElement` from the control up to the pane and assert no ancestor scrolls, then prove
the assertion discriminates by restoring `overflow-y-auto` and watching it go red.

## Related

- TASK-1786 — PR #93 (`20b3a6f`) the fix, PR #94 (`91a5da9`) the last-row test
- TASK-1783 / TASK-1794 — shipped the pane and the file view that inherited the defect
- `jsdom-has-no-layout-engine-component-tests-cannot-see-off-screen-or-lazy-image-d` — how to test this class
- INBOX-1910 — the fixture question this surfaced
