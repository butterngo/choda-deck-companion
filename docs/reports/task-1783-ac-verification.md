# TASK-1783 — AC verification

Session SESSION-1787663432681-69 · 2026-08-25 · merged as `44f1eaf` (PR #77)

**6 of 6 ticked.** All machine-class.

> Supersedes the earlier report at this path, which recorded **0/5, stopped at research**. That run is not erased — it is what produced TASK-1785 and the AC-4 rewrite. See *How this task failed first*.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 subject, body, per-file stat | ✅ | `+25 / 1` on a text file, `binary` on a binary one — never `+0/−0` |
| AC-2 task title + link | ✅ | Live twice: `9dfe9c4`→TASK-1767, `00f9f6b`→TASK-985 |
| AC-3 ADRs, declared vs mentioned | ✅ | Both badges asserted; **live control picked deliberately** |
| AC-4 reopen makes no request | ✅ | fetch spy: 1 call across two opens; two controls |
| AC-5 untagged commit | ✅ | `CapabilityNote`, not `ErrorState`; paired control |
| AC-6 reachability mark | ✅ | Injection reddens exactly the two controls |

## How this task failed first

The first attempt stopped at research with **0/5** and wrote no code. Two findings did that:

1. `GET /tasks/:id` — the only route carrying task title and ADRs together — took **~15 s** and blocked the single-threaded adapter. Filed as TASK-1785, fixed, now **19 ms**.
2. AC-4's premise was false: `GET /knowledge?type=decision` returns no bodies, so the client-side matching it assumed is impossible.

Neither was worked around quietly. The first became a critical task; the second became an AC rewrite with the reasoning written into the task body, so a reader six months from now sees that the criterion changed and why.

## The live control was chosen, not stumbled into

AC-3 needed a commit whose task actually has ADRs. The obvious candidate — `9dfe9c4` → `TASK-1767` — has `adrs: []`. Checking it would have "passed" while proving nothing about ADR rendering.

Searched for one that does:

```
00f9f6b  docs(adr): draft ADR-031 session_end field derivation (TASK-985)
  reachability: default-branch   taskIds: [TASK-985]   files: 1
    → TASK-985  "session_end: auto-derive handoff fields…"
        ADR-032-unified-knowledge-graph-v2   via: body
        ADR-031-session-end-derivation       via: body
```

Same trap as TASK-1785's AC-2, caught the same way.

## Findings worth carrying

1. **A component gaining a dependency silently breaks a fake that never named it.** Adding `useWorkspaceCommit` to `WorkspaceView` took down all 15 tests in `workspace-view.test.tsx` — the real hook ran without a `QueryClientProvider`. Second instance this run; the first was the `task-detail` fake in TASK-1785, which failed at *runtime while typecheck stayed green*.
2. **Restore an injection from the index, not from HEAD.** `git checkout --` on a file that was never committed discards the implementation. That cost a re-write in TASK-1780; here `git checkout-index -f` was used instead.
3. **The stale adapter is visible from the app's side.** The long-running adapter on 7338 returned `reachability: MISSING` because it predates TASK-1784 — a live demonstration of INBOX-1888's vendoring gap, not a theory.

## Gates

typecheck 0 · web 47 files / 300 tests 0 (+16) · electron+scripts 5 files / 72 tests 0 · lint 0 · build 0
No CI on this repo. Merge proven: `44f1eaf` is an ancestor of `origin/main`.
