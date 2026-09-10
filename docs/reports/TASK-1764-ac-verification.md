# AC verification — TASK-1764: Browse the work: Projects → Workspaces → docs, tasks and the code behind them

**Verdict:** 5/6 verified (2 with a caveat) · epic is substantively complete; AC-6 is human-class by construction and stays open
**Date:** 2026-09-10 · **Session:** none active — no `ac_check` was written · **Commit:** ad5cc7d

## 1. Summary

| # | Criterion | Class | Verdict | Proof |
|---|-----------|-------|---------|-------|
| 1 | AC-1 — workspace docs reachable by clicks alone, click path named | machine (packaged half human) | ⚠️ | link chain Sidebar → /projects → /workspaces/:id → Files tab, proven by injection; markers present in packaged 0.12.5 asar; the clicks themselves not performed |
| 2 | AC-2 — a task's provenance reachable by clicks alone | machine (packaged half human) | ⚠️ | same chain via the Tasks tab → /tasks/:id → TaskProvenance; not clicked in the packaged app |
| 3 | AC-3 — every route in `router.tsx` has an inbound link, guarded by a test that fails when a link is removed | machine | ✅ | 16/16 green; real injection made it red naming `workspaces/:id` |
| 4 | AC-4 — Projects and workspaces render loading / empty / unreachable via shared primitives | machine | ✅ | 52/52 green across both view suites, each state a separate test with a control |
| 5 | AC-5 — typecheck, lint, web + electron suites pass, exit codes captured individually | machine | ✅ | 0 / 0 / 0 (632 web) / 0 (79 electron), four separate captures, no pipe |
| 6 | AC-6 — Butter opens the packaged build and clicks Projects → project → workspace | human | 👤 | needs a desktop session (INBOX-1873) |

✅ proven · ⚠️ proven with a caveat · ❌ failed · ⛔ blocked · 👤 needs a human

## 2. Done — what is proven

**AC-3 — the reachability guard.** `npx vitest run src/__tests__/route-reachability.test.ts` → 16 passed, exit 0.

Discriminator, run rather than assumed: the sole inbound link to `/workspaces/:id` in `ProjectsView.tsx:52` was replaced with `to="#"`, the substitution confirmed applied on disk, and the suite re-run:

```
FAIL  checkReachability over the REAL app > every declared route has at least one in-app link
AssertionError: expected [ 'workspaces/:id' ] to deeply equal []
```

exit 1, then restored via `git checkout` and the tree confirmed clean. A broken build could not have produced the green run: the same command distinguishes the two worlds, and it named the right route rather than merely going red. `/projects` was deliberately *not* chosen for the injection — it carries two inbound links (`SidebarNav.tsx:100` and `WorkspaceView.tsx:363`), so removing one would have proven nothing.

**AC-4 — the three states.** `projects-view.test.tsx` + `workspace-view.test.tsx` → 52 passed, exit 0. The three states are three separate tests per view, each with its counterpart as the control — "renders unreachable as ErrorState, NOT as an empty list", "renders a genuinely empty project list as EmptyState, NOT as an error", "renders loading as a Skeleton" for Projects; "an unregistered workspace id is a FAILED lookup, not an empty workspace", "a project with no open tasks is an EmptyState, not an error", "unreachable is its own state, distinct from both of the above" for Workspace. Source confirms the primitives are the shared ones (`ErrorState` / `EmptyState` / `Skeleton` from `components/state/`), never a bare `<p>` — the TASK-1597 rule holds by construction.

**AC-5 — the gates, four separate captures.**

| Gate | Command | Exit |
|---|---|---|
| typecheck | `pnpm run typecheck` | 0 |
| lint | `pnpm run lint` | 0 |
| web suites | `pnpm -r --filter=./packages/* run test` | 0 — 67 files, 632 tests |
| electron | `npx vitest run -c electron/vitest.config.cjs` | 0 — 6 files, 79 tests |

Each `$LASTEXITCODE` was read immediately after its own command; nothing chained through a pipe, which is what the criterion asks for.

## 3. Not done — what is NOT proven

**Failed:** none.

**Proven with a caveat — AC-1 and AC-2.** Both ask that a user reach a destination "from a cold start of the packaged app… using only clicks". Three of the four things that claim needs are proven; the fourth is not.

Proven — the click path exists as a real link chain and is named:

- **AC-1 (docs):** app opens on Sync → sidebar **Projects** (`SidebarNav.tsx:100`, `to="/projects"`) → a project row (`project-row-{id}`) → a workspace row (`ProjectsView.tsx:52` → `/workspaces/{id}`) → the workspace opens on the **Files** tab, which renders `WorkspaceDocsView` with a fixed `workspaceId` (`WorkspaceView.tsx:316`) → a doc in the tree. Five clicks, no typed URL.
- **AC-2 (provenance):** from that same workspace → **Tasks** tab → a task row (`WorkspaceView.tsx:242` → `/tasks/{id}`) → `TaskDetailView` + `TaskProvenance`, whose ADR link (`TaskProvenance.tsx:55`) and changed-file link (`TaskProvenance.tsx:107`) continue the chain.

Proven — the chain is load-bearing, not decorative: the AC-3 injection above shows the guard goes red the moment one of its links disappears.

Proven — the shipped 0.12.5 artifact carries it, not just the source tree: `release/win-unpacked/resources/app.asar` (built 2026-09-09 17:21) contains `/workspaces/`, `workspace-docs?workspaceId=`, `pick a project, then a workspace`, `workspace-task-` and `No workspaces registered`. This check exists because of the TASK-1918 lesson — a source-tree pass answers a question about the source tree, not about the binary a person double-clicks.

Not proven — nobody clicked. An agent has no desktop session here, so "from a cold start of the packaged app" rests on the link graph plus the bundle grep. That residual is not inconvenience; it is exactly the gap AC-6 was written to close, and it is why these two are ⚠️ rather than ✅.

**Not run:** nothing.

## 4. Blockers — what stopped verification

**No active session in the Companion workspace, so nothing could be ticked.** `ac_check` requires one, and starting a session is a state change (it moves the task to IN-PROGRESS) that was not authorised for a read-oriented verification pass. Every verdict in this report is therefore evidence-complete but unticked. Unblocked by `/session-start` on TASK-1764, after which the five ticks can be written verbatim from §2 and §3.

This is not a verdict on the change.

## 5. Needs a human — what this skill structurally cannot prove

**AC-6.** Sequence, for someone picking it up cold:

1. Launch the installed **0.12.5** build (`release/choda-companion-setup-0.12.5.exe`, or the existing install if it already reports 0.12.5 — an older build predates the Projects entry point entirely and would fail for the wrong reason).
2. Do not touch anything first; the app should open on **Sync**. That is the cold start the criterion names.
3. Click **Projects** in the sidebar, WORK group.
4. Click a project — **Choda Deck** is the useful one; its detail pane must list exactly four workspaces (Companion, Main, Skills, choda-gateway) and no workspace belonging to another project.
5. Click **Companion**. The workspace opens on the **Files** tab showing its `.md` tree.
6. Click the **Tasks** tab, then any task row.

**What failure looks like**, so it can be seen rather than relayed: a workspace row that does not navigate; a Files tab showing "unavailable" rather than a tree; a Tasks tab that is empty when the workspace demonstrably has tasks; or any point where the only way onward would be typing a URL — which the packaged window has no address bar for.

Worth doing in the same sitting: AC-2 of **TASK-1766** is about the Tasks tab you land on in step 6.

## 6. Steps — what was actually done, in order

1. `task_context(TASK-1764)` — read the epic and its three subtasks. TASK-1765 DONE 6/6, TASK-1767 DONE 6/6, TASK-1766 IMPLEMENTED with AC-2 open.
2. `ac_review(TASK-1764)` — 2 `ok`, 4 `weak`, all four on "observable with the surface named". Advisory; recorded in §7.
3. `task_touches(TASK-1764)` — empty. The epic has no code anchors of its own; its subtasks carry the work.
4. Read `router.tsx`, `route-reachability.ts` and the guard test rather than trusting the task's description of them.
5. Grepped every `to=` / `href=` in the source to build the link graph by hand, and confirmed it against the router's route list.
6. Ran the reachability suite on the clean tree — 16 passed, exit 0.
7. **Injection:** replaced the sole `/workspaces/:id` link with `to="#"`, confirmed the substitution landed, re-ran → red, naming `workspaces/:id`. Restored, `git status --porcelain` clean.
8. Grepped the packaged 0.12.5 `app.asar` for the click-chain markers — all five present.
9. Ran the two view suites for AC-4 — 52 passed, exit 0.
10. Ran the four gates for AC-5 individually, reading `$LASTEXITCODE` after each.

**Rejected attempt, recorded so it is not repeated:** the first injection candidate was the sidebar's `to="/projects"`. Discarded before running — `/projects` has a second inbound link from `WorkspaceView.tsx:363` (the "back to Projects" affordance), so deleting one would have left the guard green and produced a false all-clear about the guard's own sensitivity. The right injection target for a reachability guard is a route with exactly one inbound link.

## 7. Findings

⚠️ **The epic's ACs are unticked, but its subtasks did the work and were ticked at the time.** TASK-1765 and TASK-1767 are DONE at 6/6 and TASK-1766 sits at 5/6. Nothing about the parent was re-litigated here — AC-3 in particular is TASK-1767's whole subject and was verified again from scratch rather than inherited, which is why the injection was re-run rather than cited.

⚠️ **TASK-1766 AC-2 is the one genuine hole in the epic** and is not covered by any criterion of the parent. It asks that the workspace's task list be scoped by the touches → session → flagged-unscoped cascade, with a real task named in each of the three buckets. `WorkspaceView.tsx:234` renders a `task-scope-note` and the suite has "states the scope instead of implying workspace precision it does not have", so a scope *statement* exists — but the three-bucket proof the criterion asks for has not been produced. The parent reads as further along than the child it depends on.

**`ac_review` disagreed with four of six criteria**, all with the same concern — "observable with the surface named". The suggestions amount to spelling out which component or button is meant (AC-4's "shared loading component", AC-1's element sequence). Advisory and not acted on: the wording was clear enough to design a discriminating test for each, and rewriting an AC after the fact is spec drift. It is a fair reading of AC-1 and AC-2 specifically, whose "using only clicks" left the packaged-versus-source question open — the ambiguity that produced this report's two ⚠️ rather than two ✅.

**The guard has a documented self-fooling history worth knowing about.** `route-reachability.ts` strips comments *first*, and the comment above that line records why: during TASK-1767, deleting the app's only real link to `/tasks/:id` left the check green, because the file's own doc comment contains the same link written as an example. The scanner was reading its documentation and counting it as a link. That is the sharpest instance in this codebase of a check that could not fail, and it was caught by injection — the same technique used here.
