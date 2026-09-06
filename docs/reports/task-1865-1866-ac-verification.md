# TASK-1865 and TASK-1866 — AC verification

**Docker: see what is running, and start or stop it**

Autonomous run · 2026-09-06 · two repos
Merged: `choda-deck` #273 `baaf2a3`, #274 `65a3689` · companion #114 `a12599f`, #115 `04bea9c` — all proven ancestors
Release: 0.10.0, adapter sha256 `b1749610…8796bca6`
Gates via each repo's own scripts: `choda-deck` 1922 passed · companion 530 web + 72 electron
CI: `choda-deck` three checks pass on both PRs

## TASK-1865 — read half. Done, 8 of 8

| AC | Proven by | Discriminator |
|---|---|---|
| AC-1 | The exited container is returned with its state and image | Injection to a running-only listing reddens it — filtering leaves a list that still *looks* plausible |
| AC-2 | Labelled reports the path; unlabelled reports `null` and is **still present** | Both failures ruled out in one test: dropping it hides containers, guessing a project invents facts |
| AC-3 | Case **and** separator differences resolved in one test | A lowercase-only normaliser passes one and fails the other, which a single-difference test would not catch. Plus a control for a non-matching path and a sibling-prefix unit test |
| AC-4 | 501 with `ps()` never called and no stack frame in the body | A throwing listing is 502 with the adapter's own message, asserted **not** to contain the daemon's `npipe` path |
| AC-5 | `tail=99999` returns 1000 **and the reader was asked for 1000** | A cap applied only to the response still lets an unbounded body cross the process boundary |
| AC-6 | All 19 route tests inject a stub | Proven by CI passing on ubuntu and windows, neither of which has this machine's Docker |
| AC-7 | An id shaped like a flag (`--volumes-from`) is refused, not just an unknown one | A control proves a **known** id does reach the reader, so "never called" is not satisfied by a route that never works |
| AC-8 | "No containers attached" names what attaches one | A control proves the message disappears when containers exist |

**Live:** 25 containers parsed and matched in 136 ms; 13 labelled; the three `jm-*` containers attached correctly; the rest `null`.

## TASK-1866 — write half. Done, 7 of 8

| AC | Proven by | Discriminator |
|---|---|---|
| AC-1 | `-t 1` appears in argv verbatim; the default is `-t 10`; `start` takes none | Measured basis: 1415 ms against 10627 ms |
| AC-2 | A never-exiting child yields 409 | The stub is written so a route that *waited* would **hang** the test rather than fail it. The deadline is asserted to be strictly greater than what docker was asked for |
| AC-3 | Two concurrent requests complete fast-then-slow | With `execFileSync` the order would be slow-then-fast — the exact property that made a new spawner necessary |
| AC-4 | Seven bad values each 400, spawn log **empty** | Refused, not clamped: a silent clamp hides a caller sending nonsense. A control proves 60 is accepted |
| AC-5 | Eight actions refused **by name** | `stopp` is in the list because a prefix check would admit it; `exec`/`rm`/`kill` because a denylist of `up`/`down` would |
| AC-6 | The click renders a question; the call log stays empty until it is accepted | A control proves confirming issues exactly one, to the right container |
| AC-7 | An exit-0 stop whose container is **still running** reports `running` | This is the whole criterion. A route reporting success would say `exited` |

### AC-8 not done — human

> Stop a real container from the packaged app, confirm with `docker ps`, start it again.

No stub can detect the app and the daemon disagreeing, because a stub agrees with whatever the code believes. **TASK-1866 stays at IMPLEMENTED.**

## Injections

| Injection | Red | Right? |
|---|---|---|
| Container id straight to argv | 2 | yes |
| Running-only listing | 2 | yes |
| Lowercase-only path match | 2 | yes |
| Drop the adapter's own timer | 1 | yes |
| Allowlist → denylist of `up`/`down` | 2 | yes |
| Assume state from the action | 1 | yes |
| Click acts as well as asks | 3, incl. the control | yes — the right blast radius for deleting a confirmation |

## Findings

**The discovery's central claim was wrong, and measuring is what found it.** `docker-management-discovery.md` said mutating commands are "long-running, state outliving the request". They are not: `docker stop` is 10.6 s only because the SIGTERM grace defaults to ten seconds, and `-t 1` brings it to 1.4 s. The ceiling was always ours.

What the measurement *did* overturn was synchrony, which nobody had questioned. The `git` precedent is `execFileSync` and is fine at 127–206 ms; at 1.4 s it would freeze the adapter, and at 10.6 s it would look like a crash. So the real content of TASK-1866 turned out to be the adapter's first asynchronous child process — not "run docker".

**The `up`/`down` boundary is not "mutating vs not".** `start` and `stop` mutate too. The line is *can a ceiling be put on it*: `up` can pull or build, which is genuinely unbounded, and that is what a terminal is for.

**A test caught a bug I would have shipped.** The Docker tab rendered and `?tab=docker` did not select it, because the strip and the URL parse were two lists and I extended one. They are one `const` now with the type derived from it.

**A guard was rewritten rather than re-satisfied.** TASK-1830's test asserted "exactly four tabs". The count was never the claim — its own `describe` says *without joining the sidebar*, and the test has never looked at the sidebar. It now pins the strip's contents and order and **states that the sidebar half is asserted nowhere**, which is better than letting the title imply coverage.

## Two mistakes of mine, recorded because they cost something

**I unpacked one of Butter's stashes into the working tree.** Chasing an intermittent suite error, I ran `git stash push <paths>` including an **untracked** file — that form fails — then `git stash pop`, which applied `pre-TASK-1424 knowledge-doc drift` with a conflict in `docs/knowledge/INDEX.md`. Recovered with `git reset` and `git checkout HEAD -- docs/knowledge/`. **Nothing of his was consumed**: the pop conflicted, so the stash entry survived. Three untracked knowledge files were rewritten by it and git cannot tell me whether their content is current; the store is the source of truth, so `knowledge_verify` would settle it.

**The conclusion that prompted that was itself wrong.** I decided the suite error was caused by my change on the strength of one comparison run. Six runs later: it is intermittent, it predates me, and clean runs include my change. Filed as **INBOX-1947**, including the part that matters most — a dying worker still prints a green-looking summary with a quietly lower pass count.

## Open

- **AC-8** — needs the packaged app and `docker ps`
- `docker ps -a` was measured at 25 containers. The cost at 100+ is unmeasured, and the tab loads it on open
- The tab-strip guard still does not assert its own sidebar promise; stated in the test rather than fixed, because the sidebar is not rendered in that test's mount
