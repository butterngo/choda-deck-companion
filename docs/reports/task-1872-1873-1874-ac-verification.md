# TASK-1872, TASK-1873, TASK-1874 — AC verification

**Logs you can read · images you can prune · containers you can create**

Autonomous run · 2026-09-06 · two repos
Merged: companion #117 `f1e228b`, #118 `a6bcf70`, #119 `4b3bf4a` · `choda-deck` #275 `5c30c0d`, #276 `6b046da` — all proven ancestors
Release: 0.11.0, adapter sha256 `6b4272f6…a883726a`
Gates via each repo's own scripts: `choda-deck` 1956 passed · companion 562 web + 72 electron
CI: `choda-deck` three checks pass on both PRs

## TASK-1872 — logs. Done, 6 of 6

| AC | Discriminator that makes it worth having |
|---|---|
| AC-1 fullscreen | Escape asserts `document.activeElement`, not just that the overlay closed — the broken version closed it fine and dropped focus |
| AC-2 count | Clearing asserts the count is **absent**, not "4 of 4" as if a filter were applied |
| AC-3 marking | The fixture holds `ERROR` and `error`; the marks carry the text **as it appears**, so the highlight cannot rewrite the line |
| AC-4 free | Ten keystrokes, call count unchanged. A refetch here shells out to docker per character |
| AC-5 no match | Distinct from *nothing was logged* — two facts, two renderings |
| AC-6 tail | Choosing 1000 issues **one** request carrying `tail=1000`; the first read asks for 200 |

**A bug the test caught, not the implementation.** Escape closed the overlay and focus went nowhere: `focus()` inside the key handler targets the button React is about to unmount. Asserting the close alone would have passed against the broken version.

## TASK-1873 — images. Done, 8 of 8

| AC | Discriminator |
|---|---|
| AC-1 | Untagged images listed — they are the ones a reader most wants gone |
| AC-2 | In-use and unused asserted **different** in one test; `imageMatchesRef` unit-tested on all three real reference shapes plus two negatives |
| AC-3 | The 409 comes with the spawn log **empty** — the refusal is ours, so `--force` later cannot remove the guard along with the error |
| AC-4 | The removal argv asserted **whole**; `toContain` would pass with `-f` appended |
| AC-5 | An id shaped like a flag is refused, not merely an unknown one |
| AC-6 | The confirmation names the **size** — what the reader is doing this for, and what they lose if wrong |
| AC-7 | The second read returns a **different set**, which a local splice could never produce |
| AC-8 | Zero is stated; a silent success is indistinguishable from a prune that did nothing |

**Measured before written.** `docker ps --format {{.Image}}` reports a *reference*, not an id. Live: 56 images in 490 ms, 20 correctly attributed including an image held by two containers and a `ghcr.io`-qualified one.

## TASK-1874 — run. Done, 7 of 8

| AC | Discriminator |
|---|---|
| AC-1 | The argv asserted **whole** — `toContain` passes with `--privileged` appended |
| AC-2 | `volumes`, `privileged`, `network`, `env`, `command` each driven **by name**; a control proves the three allowed fields are accepted |
| AC-3 | `"80"` refused rather than coerced; the **container** side validated too; boundary values 1 and 65535 accepted |
| AC-4 | `-rm` is in the bad-name list because a name shaped like a flag is how a string becomes an argument |
| AC-5 | **`postgres:16` is refused** — a real reference that is not an id. Accepting a reference is what would let docker pull from wherever the name points |
| AC-6 | The confirmation names every port; "no ports published" is stated, because *no ports* and *forgotten ports* must not look alike |
| AC-7 | An image that exits immediately reports `exited` — `run -d` exiting 0 means *created*, not *up* |

### AC-8 not done — human

> Run a real image with a port from the packaged app, reach the port, then stop and remove the container.

No stub can detect an unreachable port, because a stub agrees with whatever the code believes. **TASK-1874 stays at IMPLEMENTED.**

## Injections — eleven, all landing where they should

| Injection | Red |
|---|---|
| Refetch logs per keystroke | 4 |
| Hide the match count | 1 |
| `-f` in the removal argv | 2 |
| Let the daemon do the in-use refusing | 1 |
| Drop untagged images | 1 |
| Remove on click without confirming | 3 |
| Splice the row instead of re-reading | 2 |
| Accept unknown body fields | 1 |
| Pass `imageId` through without the lookup | 2 |
| Assume the run state is `running` | 1 |
| Make Run create as well as ask | 5 |

## Findings

**The `up`/`down` boundary is not "mutating vs not", and neither is the volumes one.** `start`, `stop`, `rmi` and `run` all mutate. The line drawn throughout is *can a ceiling be put on it* and *does a user-supplied string choose what the process touches*. Ports pass both — an integer validates completely. Volumes fail the second, which is why they are deferred rather than included with a warning.

**Two guards were made stricter than the daemon's.** The in-use refusal for images and the name-taken check for containers both happen in the adapter before anything spawns, even though docker would refuse them anyway. The reason is the same both times: our refusal can say *which* container, and it cannot be removed by appending a flag.

**A test of mine was self-contradictory and had to be fixed rather than the code.** It banned `-f` across every argv and then asserted `image prune -f` two lines later. Those are different words — `rmi -f` force-removes, `prune -f` only means *do not ask me to confirm*, and a prune that asks would hang with no terminal to answer it.

**Two lint errors were fixed by removing something, not by suppressing it.** An `eslint-disable` comment referenced a rule this repo does not configure, so the comment was itself the error; and a stub binding was `let` and never reassigned.

## A process mistake, recorded

**I forgot `session_start` before ticking TASK-1873 AC-1**, so its evidence is bound to `SESSION-1786527042281-1` — an unrelated spike from 2026-08-12. The same mistake I made earlier in this conversation. AC-2 through AC-8 are bound correctly. `ac_check` refuses to re-record, so the mis-binding stands and is named here rather than left for someone to trip over.

## Open

- **TASK-1874 AC-8** — needs the packaged app and a reachable port
- Volumes — deferred by decision, and its own task when asked for
- `docker images` took 490 ms over 56 images against 206 ms for `ps` over 25 containers; the cost at several hundred is unmeasured
- The `freed` figure for a single removal is the image's own size string, not what the daemon actually reclaimed — shared layers mean the real figure can be smaller
