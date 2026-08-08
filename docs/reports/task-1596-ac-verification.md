# TASK-1596 — AC verification

**Task:** Web · migrate Cockpit + Sync onto the primitives
**Session:** SESSION-1786161614868-68
**PR:** [#54](https://github.com/butterngo/choda-deck-companion/pull/54) — squash-merged as `e948568`
**Merge proof:** `git merge-base --is-ancestor e94856836e7da1f83d2e0978c35facbd620a2c3c origin/main` → ancestor ✅

**Result: 4/4 verified · 0 blocked · 0 needing a human.**

## Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | No bare `<p className="text-sm text-zinc-500">` state text in either view | ✅ | `grep` over both files returns nothing. Remaining `<p>` in each is the stale/provenance footnote — content, not a state |
| 2 | `unreachable` vs `failed` split across both views | ✅ | `describe.each` over both views: `data-variant` asserted per branch, `/Can.t reach/` asserted **absent** under `failed`, and the two renders' `innerHTML` asserted **unequal** |
| 3 | Column header with count; NOW rail distinct | ✅ | Counts tracked against seeded buckets (1/2/0); all three rail class strings differ pairwise |
| 4 | Five named test files unmodified | ✅ | `git diff --stat` over all five returns nothing |

## What this task actually fixed

Both views shipped a **single branch** for two different failures:

```tsx
{health.conn === "disconnected" || ledger.isError ? (
  <p>Can't reach the laptop API — the ledger is unavailable.</p>
) : …}
```

A failed ledger query claimed the laptop was unreachable. That is the exact
conflation ADR-028 exists to prevent, and it was live in two views. TASK-1594
built the component that makes the distinction expressible; this task is where
it reaches a user.

## Discriminators

Every assertion was written so a plausible-but-wrong implementation fails it:

- **AC-2** — the criterion is not "renders an error". It is that the two
  branches produce **different output**. A view that kept one shared branch
  renders an `ErrorState` in both cases and passes any presence check; it fails
  `expect(unreachableHtml).not.toBe(failed.innerHTML)`.
- **AC-3** — three identically-styled rails would still render and still "have
  a rail". The assertion is that the class strings differ pairwise.
- **AC-4** — a green suite proves nothing about whether a test was loosened to
  make it green. The empty `git diff` over the five files is what proves it.

## Judgement call: EmptyState was not used for the columns

The per-column empty copy stays a compact muted line rather than the shared
`EmptyState`. That component is pane-sized — three stacked icons across an
empty board reads as three errors, not one calm empty state.

AC-1 names only the two *views*, so this is within the criterion. Recording it
because the epic's spirit is "no bare `<p>` state text", and this is a
deliberate exception with a reason, not an oversight.

## Gates

| Gate | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run test` | 157 web (146 + 11 new) + 49 electron |
| `pnpm run lint` | pass |
| `pnpm run build` | 3.75s |

## Findings

**FocusBoard was rewritten and its three tests never moved.** They assert copy
and resume-point behaviour, not markup, so column headers, counts and rails
went in underneath them untouched. Same result as `StatusBar` in TASK-1595.
The pattern is now consistent enough to state plainly: **tests that assert
behaviour survive presentation work; tests that assert structure do not.** The
one test that needed repointing in this epic (TASK-1595's
`conversations-route`) was a source-grep test.

**Still unverified visually.** Per TASK-1593, the gates cannot see a visual
regression. This is the first view rendering the state components against real
data, and no human has looked at it.

## Follow-ups

None.

Remaining in the epic: TASK-1597, 1598, 1602, 1603 — all unblocked. TASK-1595
still holds at IMPLEMENTED pending its resize check.
