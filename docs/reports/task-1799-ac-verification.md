---
task: TASK-1799
title: "Web: when the answer isn't one jump — picker, no definition, outdated adapter"
session: SESSION-1788340349267-36
date: 2026-09-02
verdict: 6/6 verified · 0 needing a human · 0 blocked
---

# AC verification — TASK-1799

Merge proven: `4ff2ff4` is an ancestor of `origin/main` (PR #89, squash).
All 6 criteria are machine-class. This completes TASK-1796's three subtasks.

## Done

| AC | Criterion | Proven by | Discriminator — how a wrong build fails |
|---|---|---|---|
| 1 | Several matches are all listed; the reader stays put | Panel lists both paths and both lines; journey asserts the pane still holds the caller's text | Control: a single match navigates with no list at all |
| 2 | Choosing a row opens that file at that line | Journey clicks row 2 of 2, asserts the file changed and `source-line-2` is marked | Panel asserts `onPick` got the SECOND match and **not** the first — "always the head of the list" fails |
| 3 | Zero matches say so and name the workspace | Note carries the symbol, the label, and "only this workspace was searched" | Control: a non-empty result renders no such note. A separate test proves an unresolved lookup renders nothing, so an empty array before the answer isn't read as the answer |
| 4 | Router-default 404 → "update your app" | Fetch layer rejects with `AdapterRouteMissingError`; panel asserts the other three states are absent | Ordering test: both 404s arrive with `matches: []`, so a build reading the array first would say "not found" |
| 5 | Named-workspace 404 → unknown workspace | Same test file as AC-4; asserts `UnknownWorkspaceError` and explicitly *not* `AdapterRouteMissingError` | **Injection run:** collapsing the two branches turned exactly this test red while AC-4's stayed green |
| 6 | Any other failure is its own state | 500 rejects as a plain `Error`, neither diagnosed type; panel renders `error-state` alone | The hook excludes both diagnosed 404s from `isError`, so a caller cannot render them generically by accident |

Every panel test asserts the three states it does **not** expect are absent, not
merely that the one it wants is present. A component rendering all four at once,
or collapsing them into one message, passes any single presence check and fails
these.

## Needs a human

None.

## Findings worth carrying

**The whole feature rests on an error string.** `/healthz` returns `{ ok: true }`
with no capability list, so `{ error: "not found" }` versus
`{ error: "unknown workspace: X" }` is the only thing separating "your app is
behind" from "that workspace does not exist". Reword the router's message — a
change nobody would call breaking — and this degrades silently to blaming the
user's app for a workspace typo. The code says so at the comparison, the task
body says so under Assumptions, and INBOX-1897 proposes the capabilities field
that removes the guess. It is filed, not fixed.

**An accessibility call that reverses the sibling task, on purpose.** TASK-1798
refused `<button>` for identifiers because a 500-line file would add thousands of
tab stops. Here every picker row *is* a button, because the set is bounded and a
reader is choosing from it. Same repo, same reviewer instinct, opposite answer —
the deciding factor is cardinality, not consistency.

**An unparseable 404 falls back to the outdated-adapter reading.** An adapter old
enough to lack the route is old enough to answer something this client has never
seen; a parse failure must not become a crash stacked on top of a 404. Tested
with a body whose `json()` throws.

## Steps a human can repeat

1. `pnpm run typecheck` · `pnpm test` · `pnpm run lint` · `pnpm run build` — all bare, all exit 0.
2. Suite went from 407 to 427 web tests (+20), electron unchanged at 72.
3. Injection: delete the `error.startsWith("unknown workspace")` branch in `api.ts` and re-run `src/__tests__/workspace-symbols-api.test.ts` — exactly one test goes red, and it is AC-5's.
