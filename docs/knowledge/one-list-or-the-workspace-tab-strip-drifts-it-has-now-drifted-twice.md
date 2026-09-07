---
type: gotcha
title: One list, or the workspace tab strip drifts — it has now drifted twice
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/views/WorkspaceView.tsx
    commitSha: 466ee43c2afc445ee0dadb35693466c9ca4ae43e
createdAt: 2026-09-07
lastVerifiedAt: 2026-09-07
affectedFeatureId: feature-companion-ui
---

**Trigger:** you are adding a tab to the workspace view. It renders, it is clickable, and something else about it is quietly wrong.

## Context

`WorkspaceView` has to agree with itself in three places: which tabs exist, what each is called, and which one a `?tab=` query selects. Every time one of those has been derived separately, it has drifted — **twice now, in the same file, in the same way.**

| When | What drifted | Symptom |
|---|---|---|
| TASK-1865 (Docker, 5th tab) | the strip and the `?tab=` parse were two lists | the tab rendered but `?tab=docker` was not linkable — only the strip had been extended |
| TASK-1889 (Terminal, 6th tab) | the **labels** were a chain of ternaries ending in a bare `: "Docker"` fallback | the new tab rendered, was linkable, and was labelled **"Docker"** |

The second is the instructive one. TASK-1865 had already fixed the parse by deriving both from one `TABS` const — and the bug simply moved to the one place still using a fallback. A whole-list assertion in the existing test caught it, which is the only reason it did not ship.

## Business rule

**Every per-tab fact comes from one exhaustive structure, and a gap must be a compile error rather than a fallback.**

- `TABS` is the single `as const` list; `Tab` is derived from it, and so are both the strip and the `?tab=` parse.
- Labels are `Record<Tab, string>`. Not a ternary chain, not a `switch` with a `default`, not `?? "Something"`. A missing entry is `error TS2741` — verified by removing one.

The general shape: **a fallback in a per-variant lookup converts "someone forgot this case" into "this case looks like the last one."** That is strictly worse than a crash, because it renders.

## Resolution

1. Add the tab to `TABS` and to `TAB_LABELS`; TypeScript names anything you missed.
2. Keep the whole-list assertion in `workspace-view.test.tsx` — `toEqual` on every label, in order. It is what caught this, and updating it when you add a tab is the point, not friction.
3. Add a `?tab=<new>` linkability test alongside it. The strip and the parse being one list is an invariant, not a one-off fix.

## Related

- TASK-1865 (the parse), TASK-1889 (the labels), TASK-1830 (the assertion that caught it)
- A route that renders is not a route a user can reach — the same class of gap as TASK-1766/1767
