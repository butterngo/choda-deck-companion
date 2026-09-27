# TASK-2153 — AC verification

**Task:** Companion: Activity view showing the 4 success metrics as a per-day trend
**Verified on:** companion `main` @ `cb89c05` (PR #161, squash-merged, ancestry proven; no CI workflow in this repo)
**Session:** SESSION-1790476121436-39 · **Date:** 2026-09-27
**Result:** 3/4 AC ticked · 1 needs a human (screenshot) → carried forward as **TASK-2162** · task held at IMPLEMENTED

## Done

| AC | Surface | Evidence |
|---|---|---|
| AC-1 | real `routes` table in `createMemoryRouter`, test `AC-1:` | At `/activity`, the heading level 1 is "Activity" and the pathname stays `/activity`. The catch-all would redirect to `/sync`. Only the Shell is replaced by an Outlet. |
| AC-2 | `ActivityView` with the real `useActivity` hook and fetch stubbed to `[]`, test `AC-2:` | The empty state names `choda-deck activity digest`. There are 0 `trend-*` elements and no table, and `/activity/digests` was requested. |
| AC-3 | same, with 3 digests served **out of order**, test `AC-3:` | 4 trends × 3 points each. Table rows appear in the order 09-23, 09-24, 09-25. |

## Not done — needs a human (→ TASK-2162)

| AC | Why |
|---|---|
| AC-4 | A screenshot of the running app against real digests. There is no GUI session in an unattended run, and the running `ChodaCompanionServer` predates the TASK-2152 route until it restarts. |

## Findings

- **Scope decision (Butter, 2026-09-27): no sidebar entry.** The task body said to add a nav entry in Shell. That conflicted with TASK-1830 ("i don't want to introduce more menu"), which is pinned by the Shell test that expects exactly six sidebar destinations. The run paused under burn-backlog §12 and Butter chose a link in the Sync view header instead. The sidebar guard stays green, and route-reachability is satisfied by the Sync link.
- **Process slip:** `session_start` for this task was called after implementation, just before merge and the AC ticks, instead of before any code. No AC was ticked outside a session. The file-edit hook recorded no `file_modified` events for the implementation, so the session's TOUCHES edges are thinner than usual.
- **Lint on main is red and unrelated.** Repo-wide `pnpm run lint` fails on `packages/web/src/views/MeetingSave.tsx:120` (`no-useless-escape`), which has been present since 19f1142 (2026-09-20). This change does not touch that file, and eslint on all 7 changed files exits 0. Filed as INBOX-2107.
- **Gates:** typecheck green, full suite 820 + 125 green, including DocDiagrams this run. `pnpm run build` green.
