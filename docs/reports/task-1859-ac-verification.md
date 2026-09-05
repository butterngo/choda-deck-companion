# TASK-1859 — AC verification

**Setup tab: check everything on open, so the list is the answer**

Attended run · 2026-09-05 · two repos
Merged: `choda-deck` PR #271 `4bc9ed5` · companion PR #108 `1ba01bb`, PR #109 `d1af4f6`, release PR #110 `19619d1` — all proven ancestors of their `origin/main`
Release: 0.9.9, adapter sha256 `66ba813d…c4e15fc7`, byte-identical at the packaged path
CI: `choda-deck` three checks pass (after a failure — see below); companion has none

## Done — 7 of 7

| AC | Proven by | Discriminator |
|---|---|---|
| AC-1 | Sweep covers every fixture skill **by name**; header count is 1 with one bad ref | A CONTROL proves a clean workspace reads 0, and a 503 sweep renders "could not check" with **no count** — a silent zero would read as "everything is fine" |
| AC-2 | A row with findings carries a marker + reason; a clean row carries **neither**, both asserted null | A third state is tested: an **unchecked** row also renders nothing, so it cannot pass for a clean one |
| AC-3 | The finding quotes the file's **actual** first line, not the number echoed back | A `line: null` finding still renders, marked *whole file* — the case an implementation drops |
| AC-4 | Adapter wraps `globalThis.fetch` and asserts zero non-local URLs; web asserts `reviewCalls()` empty after the sweep lands | Pointing the sweep at `/review` reddens **TASK-1845's AC-1 tests without editing them** |
| AC-5 | Filter hides and restores, matches on path; ArrowDown twice selects two **different** rows | Arrows walk the **filtered** list; `/` focuses the filter and does not swallow the key once focused |
| AC-6 | Save renders the preview with **zero** PUTs; confirm issues one with the same `if-match`; Cancel issues none and keeps the draft | One appended line yields exactly one `added` row and **zero** `removed` — a whole-file diff is the CRLF defect surfacing in the UI |
| AC-7 | Measured: inventory 57 ms, sweep **11 ms over 15 entries** | The list renders before the sweep lands, proven by a row existing with no marker while the sweep is out |

## Injections

| Injection | Went red | Right? |
|---|---|---|
| Sweep touches a provider | the adapter's free-sweep test, alone | yes |
| Sweep uses `/review` | TASK-1845 AC-1 ×2 + AC-7 ×2 + the models-free test | yes — that is the blast radius of moving the cost boundary |
| Findings as a block, not on the line | AC-3, alone | yes |
| Save writes directly | six, including TASK-1845's cost test | yes — deleting a confirmation should be loud |

## Findings

**The measurement contradicted me twice, and both corrections matter.**

I claimed 41 items in the proposal, the task body and to Butter. It is **15** file-backed entries. The 41 counted MCP servers, which are not files and cannot be checked, and `~/.claude/commands` is a dangling symlink contributing none. The sweep is 11 ms, not the "may be slower than it sounds" I flagged — the uncertainty was real, and the answer was that it was not a problem.

And **nothing on this machine currently carries a finding**. The header will usually read *0 need attention*. That is still worth shipping: it is the difference between checked-and-clean and unknown. But it does mean the feature's value here is confidence, not triage — and I would not have known that without measuring.

**CI caught a typecheck failure my local run could not, and the cause was mine.** The repo's gate is `tsc --noEmit -p tsconfig.node.json`; I ran `npx tsc --noEmit -p tsconfig.json` — my own approximation of it, on a different project graph, which passed. Running a command that *looks like* the gate is not running the gate. Every gate in this task after that point used the repo's own script.

**A guard was rewritten rather than narrowed a third time.** `"an MCP row asks for no file"` asserted nothing hit `/claude-config/`; `/models` forced one narrowing (TASK-1856) and `/validate-all` would have forced another. It now asserts the **shape** of a file URL, and carries a control proving the matcher classifies a real file URL as a read — a matcher that matched nothing would have reported zero and passed. Each narrowing had been a chance to accidentally exclude the very call the test exists to catch.

**Three TASK-1844 tests changed shape, and none changed claim.** They drove error paths by saving an untouched buffer; the preview now refuses to write zero changed lines, so they make a real edit first and go **through** the confirmation. What they assert — `if-match` carried, 409 keeps the edit, 403 and 413 read differently — is untouched.

**The diff is deliberately not minimal, and the reason is a safety property.** It trims common prefix and suffix and calls the middle changed, so it can overstate but can never report fewer changes than exist. A preview that understates lets a line through unseen, which is the whole failure it exists to prevent. Its honest limit is stated in its own CONTROL test: a change of **line endings alone** is invisible to it, and TASK-1841 AC-5's byte round trip is what actually guards that.

## Not a pass, recorded rather than waved through

`SourceViewSymbols > adds no focusable element to a long file` timed out once under full-suite load (9655 ms), passed alone (3817 ms) and on a second full run (507/507). Nothing here touches `SourceView`. It was **not documented anywhere**, and an undocumented flake becomes "known" only by being hit and waved through — filed as **INBOX-1946** so the next person finds it instead of re-investigating.

## Still open elsewhere

TASK-1849's two human checks are unaffected by this work and now easier to run: a save producing a one-line `git diff` is exactly what AC-6's preview claims, so the packaged check is now a confirmation of something visible rather than a discovery.
