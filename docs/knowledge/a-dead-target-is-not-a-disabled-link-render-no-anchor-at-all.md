---
type: gotcha
title: A dead target is not a disabled link — render no anchor at all
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/components/TaskProvenance.tsx
    commitSha: b86f0eebee0c3a16c6b4370a7d4fcb0b02116b75
  - path: packages/web/src/views/__tests__/task-provenance.test.tsx
    commitSha: b86f0eebee0c3a16c6b4370a7d4fcb0b02116b75
createdAt: 2026-08-23
lastVerifiedAt: 2026-08-24
affectedFeatureId: feature-companion-ui
---

## Trigger

Rendering a list where some rows point at something that may no longer exist — a
file path, a commit, an artifact, a note — and reaching for a "disabled link"
treatment: greyed, struck through, `pointer-events: none`, `aria-disabled`,
`onClick` that returns early.

## Context

Task detail lists the files a task changed, resolved from `task_code_refs`. Those
anchors go stale: **6 of the companion workspace's 9 code_refs point at files
that have since been deleted** — the whole dangling group is the hand-made
2026-06-04 batch with `commitSha: null`, while session-derived refs point at real
files. So a dead row is not an edge case here; it is two thirds of them.

The instinct is to keep the row looking like its neighbours and take the
interaction away with styling. That reads fine with a mouse, and is wrong
everywhere else:

- A screen reader still announces it as a link, and it still appears in the
  element rotor's list of links.
- It is still in the tab order, so a keyboard user lands on something that
  advertises a destination and then does nothing.
- `pointer-events: none` does not stop <kbd>Enter</kbd> on a focused anchor.
- Nothing about a grey colour is legible to someone who cannot see it.

There is no accessible way to say "this is a link, but not really". The element
type *is* the promise.

## Business rule

**If the destination does not exist, do not render an anchor. Not a styled-dead
one, not an `aria-disabled` one — none.** Render text, and say beside it why it
is not a destination.

The state travels with the data rather than being re-derived in the view: the
adapter resolves each path against its owning workspace's `cwd` and ships
`exists` on the row, so the view never has to guess and the two halves cannot
disagree.

## Resolution

`TaskProvenance.tsx` branches before the element is chosen:

- `exists: true` → `<a>` with the path, plus a relation chip.
- `exists: false` → `<span>`, struck through and muted, with a plain-language
  chip reading "no longer on disk", and its own `data-testid`
  (`provenance-file-missing`).

Assert the **absence of the element**, not its styling:

```ts
expect(screen.getByTestId('provenance-file-missing').querySelector('a')).toBeNull()
expect(screen.getByTestId('provenance-file').querySelector('a')).not.toBeNull()
```

A test that checks for a `line-through` class or a muted colour passes just as
happily on a styled anchor — it would confirm the appearance while the defect
survives underneath. The paired live-row assertion matters too: without it the
check passes by rendering nothing as a link.

## Related

- TASK-1748 (`26e250e`, PR #67) — established this; the dangling-ref measurement
  is in `docs/reports/companion-task-code-git-view-discovery.md`
- `a-companion-view-has-three-states-not-two-empty-capability-gap-failure` — same
  family, one level up: a row whose truth is unknown must not be dressed as a
  row whose truth is known
- TASK-1513 — `code_refs.slug` is globally unique while identity is
  `(projectId, path, symbol)`; relevant if dangling refs are ever cleaned up
  rather than merely rendered honestly
