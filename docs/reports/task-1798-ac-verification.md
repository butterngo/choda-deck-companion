---
task: TASK-1798
title: "Web: identifiers become click targets, and one match jumps straight there"
session: SESSION-1788340054542-21
date: 2026-09-02
verdict: 7/7 verified · 0 needing a human · 0 blocked
---

# AC verification — TASK-1798

Merge proven: `107a0d3` is an ancestor of `origin/main` (PR #87, squash).
All 7 criteria are machine-class; none needed a human, so none was left unticked.

## Done

| AC | Criterion | Proven by | Discriminator — how a wrong build fails |
|---|---|---|---|
| 1 | The identifier carries its exact name | Real highlighter, the requirement's own line; `Auth` is a separate target and `Auth.ServiceTokenWorkspaceFilter` is not a target | Truncating the attribute by one char turns it red (verified) |
| 2 | Text and highlight classes unchanged | Same file rendered with and without symbols; `textContent` and the `hljs-` element count compared | The count is also asserted > 0, which caught a first draft comparing two zeroes |
| 3 | Escaped source cannot become an element | Fixture whose source literally holds `<script>alert(1)</script>` | An unsafe re-parse yields a real `<script>` node and fails |
| 4 | The click reports that identifier, for that workspace | Component test on the name; journey test records the hook's arguments | Paired with a click on punctuation asserting silence |
| 5 | One match opens that file at that line | Pane content changes AND `source-line-2` is marked while `source-line-1` is not | A jump ignoring the match's line lands on line 1 and fails |
| 6 | Unknown language: nothing offered, and it says so | Zero `data-symbol`, `data-symbols="off"`, visible note | Two controls: a recognised file DOES wrap; a pane without the prop shows no note |
| 7 | No new focusable elements | 200-line file counted before and after: equal | Plus an assertion that >200 targets exist, so equality cannot pass trivially |

## Needs a human

None.

## Findings worth carrying

**A test that could not fail, caught by its own guard.** The first draft of AC-2
waited for symbols to appear before measuring highlight classes. With symbols on,
the wrapped spans appear on the *plain-text* path before any grammar loads — so it
measured the pre-highlight frame and compared `0` to `0`. Only the trailing
`expect(wrappedClasses).toBeGreaterThan(0)` exposed it. Without that line the
criterion would have been ticked on a comparison of two empty sets.

**INBOX-1892 recurred, exactly as written.** Adding `useWorkspaceSymbols` to
`WorkspaceDocsView` took down all 15 tests in `workspace-docs.test.tsx` with
`No QueryClient set` — the real hook running inside a test whose fake never named
it. The inbox entry describes this precise failure (same file count, same error)
from `useWorkspaceCommit` in `WorkspaceView`. Nothing in the repo prevents the next
one; the fix each time is to name the dependency in the mock, after the fact.

**No CI in this repo.** `gh pr view 87 --json statusCheckRollup` returns zero
checks (INBOX-1750, INBOX-1689). The four local gates were the only gate — unlike
TASK-1797, where three CI checks including `windows-latest` ran independently.

**Local `main` is diverged and was left that way.** It carries Butter's unpushed
`135c0a0 chore(release): 0.9.1` and is now also one behind after the merge.
`gh pr merge` tried to fast-forward and refused, correctly. This run did not
rebase or discard that commit — the feature branch was cut from `origin/main`
precisely so the PR could not carry it.

## Steps a human can repeat

1. `pnpm run typecheck` · `pnpm test` · `pnpm run lint` · `pnpm run build` — all bare, all exit 0.
2. Suite went from 386 to 407 web tests (+21), electron unchanged at 72.
3. Injection: in `lib/symbols.ts`, change the wrapped attribute to `match[0].slice(0, -1)` and re-run — 9 tests go red across the lib, the component and the journey.
