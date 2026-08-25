# TASK-1783 — AC verification

Session SESSION-1787656788701-28 · 2026-08-25 · **STOPPED at research, before any code was written.**

**0 of 5 ticked. Nothing was implemented.** The task cannot be built as specified; blocked on TASK-1785.

| AC | Verdict | Why |
|---|---|---|
| AC-1 subject + body + stat | ⬜ not attempted | Depends on the panel that could not be built |
| AC-2 task title + link | ⬜ **blocked** | Needs `GET /tasks/:id` per opened commit — measured at **~15 s** |
| AC-3 ADRs with declared/mentioned | ⬜ **blocked** | Same call |
| AC-4 knowledge index fetched once | ⬜ **premise false** | The route the AC named cannot support it — see below |
| AC-5 untagged commit panel | ⬜ not attempted | Depends on the panel |

## What stopped it

Two findings, both measured against the live adapter rather than inferred.

**1. `GET /tasks/:id` costs ~15 seconds, and blocks the adapter while it runs.**

```
/healthz            200 in 0.003s     (idle)
/tasks/TASK-1767    200 in 14.994s
/tasks/TASK-1782    200 in 14.754s
/healthz            200 in 0.002s     (idle again)
```

Cause: `collectAdrs` calls `getKnowledge` on all 44 decision entries to scan their bodies, and `getKnowledge` computes ref staleness on every read (`knowledge-service.ts:300-301`) — a `git log` subprocess per ref. Proportional and visible per entry: ADR-032 (4 refs) 0.567 s, ADR-031 (0 refs) 0.006 s.

Provenance never uses that staleness. Every git invocation on this path is wasted.

The adapter is single-threaded, so this is not only the caller's 15 s: five abandoned requests left `/healthz` timing out at 25 s while `/knowledge` and the commits route answered in 3 ms and 300 ms once the queue drained.

**2. AC-4's premise is false.** The AC said the ADR index should be fetched once per page and matched client-side, and that `GET /knowledge?type=decision&projectId=` already made that possible. It does not: the list returns 44 entries carrying `slug, projectId, workspaceId, scope, type, title, filePath, createdAt, lastVerifiedAt` and **no body**. Since 38 of 39 ADRs link to their task by prose mention in the body, client-side matching cannot be done from that payload.

So neither route can serve the panel: the one with the data is 15 s, and the fast one lacks the data.

## Why the AC was not quietly rewritten

Reaching for `GET /tasks/:id` per opened panel would have satisfied a literal reading of AC-4 — the client would fetch the knowledge index zero times, which does not "scale with the number of commits opened". It would also have shipped a panel that takes 15 seconds to open and freezes the rest of the app while it does. That is the shape of change this repo files rather than makes.

## Blocker

**TASK-1785** — `GET /tasks/:id` takes 15 seconds and blocks the whole adapter. Filed critical, with the three directions and a control AC (the fast route must still return the same `adrs[]`, so a fix that loses the data cannot pass on speed alone).

Note it is not only this task's problem: **`TaskDetailView` already ships this path** (TASK-1748, v0.7.0). Opening any task in the companion today stalls ~15 s. It appears nobody filed it, which suggests it reads as "the app is slow" rather than as a defect.

## State left behind

No code written. Branch `feat/commit-detail` created and deleted. Session cancelled rather than ended, so the task returns to READY rather than claiming to be IMPLEMENTED. Working tree clean, on main.
