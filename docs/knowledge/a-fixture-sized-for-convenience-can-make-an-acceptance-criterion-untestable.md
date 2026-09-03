---
type: learning
title: A fixture sized for convenience can make an acceptance criterion untestable
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/views/__tests__/workspace-view.test.tsx
    commitSha: 91a5da962ec766f469142d6512fc0591acfa4d38
createdAt: 2026-09-03
lastVerifiedAt: 2026-09-03
---

## What happened

TASK-1786's defect was **positional**: the commit detail panel rendered below a list of up
to 100 rows, so how far past the fold it landed depended on which row was clicked.

Every test in the fixing PR clicked row 1 of a **two-row** fixture.

Those tests were not wrong. They were green before the fix for the right reason and red
under injection for the right reason. But no arrangement of assertions over a two-row list
can express "clicking near the bottom of a long list still works" — the fixture had already
removed the variable the criterion was about.

Three of the four acceptance criteria were legitimately proven by them. AC-3 was not, and
was only caught because its text said **"the LAST ten rows"** explicitly. Had it read "the
panel stays visible", it would have been ticked on evidence that could not have failed.

## The generalisation

**When a criterion makes a claim about a range, position, or scale, the fixture is part of
the claim.** A test that drives one end of the range is evidence about that end and silence
about the other. The assertion is the visible half of a check; the fixture is the half that
decides what the check *could* have caught.

The failure mode is quiet in a way a missing assertion is not. A missing test shows up as
an untested criterion. This shows up as a *passing* one.

## What was done

A separate commit (PR #94, `91a5da9`) filled the log to 100 rows and clicked the bottom
one, then confirmed it went red under the same injection as the others. AC-3 was ticked on
that, not on the two-row tests.

## Open question — INBOX-1910

Whether this is better handled by a convention (a positional AC obliges the test to drive
both ends of the range) or by a habit (size the fixture to the claim, not to typing
convenience). No rule was adopted; the observation is recorded so the next instance is
recognised rather than rediscovered.

## Related

- TASK-1786 · PR #93 (`20b3a6f`), PR #94 (`91a5da9`)
- INBOX-1910 — the open question
- `jsdom-has-no-layout-engine-component-tests-cannot-see-off-screen-or-lazy-image-d`
