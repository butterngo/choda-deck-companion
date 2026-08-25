# TASK-1782 — AC verification

Session SESSION-1787654391694-18 · 2026-08-25 · merged as `3378dbd` (PR #74)

**4 of 5 ticked. AC-5 needs a human and stays unticked.** Task holds at IMPLEMENTED.

| AC | Class | Verdict | Evidence |
|---|---|---|---|
| AC-1 rows | machine | ✅ | Live adapter payload, `choda-deck-companion`, limit=5: every row carries `shortSha`, `subject`, `authorDate`, `taskIds` — e.g. `3378dbd \| ["TASK-1782"] \| 2026-08-25`. Rendered row asserted with its task badge. |
| AC-2 untagged shown + marked | machine | ✅ | Same live page mixed both: `3378dbd`, `9bca7ae`, `9dfe9c4` tagged; `ad39672`, `023b197` with `[]` **and present**. Rendered as `commit-task-unknown` vs a `/tasks/TASK-1767` link. |
| AC-3 git failure → error, not empty | machine | ✅ | **Live 409 in real data** — see below. Plus the view test and its paired control. |
| AC-4 unreachable ≠ git failure | machine | ✅ | `conn="disconnected"` with `gitUnavailable` also set → `data-variant="unreachable"`; AC-3 asserts `"failed"` on the same component, so collapsing them fails one. |
| AC-5 packaged app | **human** | ⬜ **not run** | No desktop session in the agent environment (INBOX-1873). Not ticked on test output. |

## AC-3 found a real one

The 409 branch was not proven with a fabricated fixture alone. Probing the registered workspaces against a live adapter turned up a genuine case:

```
GET /workspaces/http-proxy/commits?limit=2
→ 409 {"error":"workspace cwd is not a git repository",
       "workspaceId":"http-proxy","label":"http-proxy",
       "cwd":"C:\dev\test\http-proxy\http-proxy"}

control: GET /workspaces/claude-skills/commits?limit=2 → 200
```

The cwd exists; it is simply not a repository. That is exactly the state that would have rendered "no commits yet" under the old habit, and it is already sitting in Butter's data.

## Injections

Each confirmed applied by diff before its result was trusted.

| Injection | Result |
|---|---|
| `commits.filter(c => c.taskIds.length > 0)` — the tempting tidy-up | 4 red, across `CommitList` and `WorkspaceView` |
| Let the git failure fall through to the empty branch | exactly the AC-3 test red |

## Needs a human

**AC-5** — open the packaged app, navigate to a workspace, see History listing real commits. Three launch approaches have failed from the agent environment (INBOX-1873); this is a standing constraint, not a one-off.

Worth batching with **TASK-1764 AC-6**, which has been waiting on the same thing since 2026-08-24.

## Findings worth carrying

1. **The running adapter was serving `/workspaces` (200) while 404ing the new commits route.** The companion consumes the *vendored* bundle, which refreshes at release rather than per task — so a freshly merged adapter route is not live for the app until then. Demonstrated, not assumed.
2. **A fixture cannot find an unregistered failure.** AC-3's real 409 came from probing live workspaces, not from the fixture that already passed.
3. **The date is rendered from the ISO prefix, not `toLocaleDateString`** — the latter varies by the runner's locale, so a passing assertion on one machine says nothing about another.

## Environment note

While stopping the throwaway adapter on port 7399, the process filter also matched a pre-existing adapter on 7338 and stopped it. A supervisor restarted it within seconds (proved by `EADDRINUSE` on a restart attempt plus `healthz → {"ok":true}`), and it now serves the commits route. No lasting change.

## Gates

typecheck 0 · web 43 files / 269 tests 0 (+11) · electron+scripts 5 files / 72 tests 0 · lint 0 · build 0
No CI configured on this repo. Merge proven: `3378dbd` is an ancestor of `origin/main`.
