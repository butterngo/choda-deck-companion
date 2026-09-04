# TASK-1844 — AC verification

**Web: edit and save in the Setup pane, with findings beside the text**

Run: `/choda-burn-backlog`, iteration 4 · 2026-09-04 · **repo switch: choda-deck → choda-deck-companion**
Merged: PR #101, squash `e03665f`, proven ancestor of `origin/main`
Gates: `typecheck` / `lint` / `build` exit 0, each run bare · `pnpm test` 471 web + 72 electron (was 463 + 72)
CI: this repo has **none** — `gh pr checks --watch` ran and reported "no checks reported", which is a confirmed all-clear rather than the race iteration 1 lost

## Done — 5 of 6

| AC | Class | Proven by | Discriminator |
|---|---|---|---|
| AC-1 | machine | Save issues exactly one `PUT` whose `if-match` equals the etag the read returned (`aaaa1111`) | Asserted on the header's **value**, not its presence. Injection: sending an empty `if-match` reddens this test alone |
| AC-2 | machine | A stubbed 409 renders the conflict message, the textarea still holds `# mine`, and the `PUT` count stays at 1 | Both halves are checked — the edit is not discarded **and** no retry is issued |
| AC-3 | machine | 403 and 413 driven in one test, both messages captured and asserted **not equal** | A per-status check would pass against one shared generic failure; this cannot |
| AC-4 | machine | Two findings render with `data-severity` and message; a CONTROL asserts `findings: []` renders a stated pass | An empty area reads as "never checked" — the control is what separates the two |
| AC-5 | machine | Ten input events; the call log gains zero `PUT`, zero `/validate`, and zero entries of any kind | Injection: validating on every keystroke reddens this test alone |

## Not done — 1

**AC-6 (human)** — edit a `SKILL.md` in the packaged app, save, confirm `git diff` shows only the changed lines. No human is in this loop, and a green suite is not evidence for it. **Carried forward as TASK-1849**, which also covers the release the check depends on. This task stays at **IMPLEMENTED**.

## Findings

**The BOM hazard from TASK-1841 was paid off here, and it mattered.** That task found `Response.text()` strips a leading BOM and pinned it with an adapter test rather than fixing anything, because the client that would lose bytes did not exist yet. It does now. The read uses `arrayBuffer()` + `TextDecoder(ignoreBOM: true)` and the save encodes that string back.

Measured before writing it rather than assumed: default decode drops the BOM, `ignoreBOM` keeps it as `U+FEFF`, and the round trip is byte-identical with CRLF intact. Without that, the first save of `template-registry.json` would have rewritten a file whose BOM has already broken `JSON.parse` in production once.

**The guard I wrote in TASK-1831 went red on this change — a false positive.** Moving the URL into `refUrl()` meant the literal `fetch` shape no longer appeared in source, while the route very much had callers. A source grep cannot follow one hop of indirection.

It now asserts both halves (something builds the URL, something fetches what the builder returns) and states in its own comment that this proves *a shape in text, not a request at runtime*. Verified it still goes red when the real caller is removed. The underlying limitation is INBOX-1933.

This is worth recording as a property of the technique, not a one-off: **a guard that greps source is coupled to how the code is written, not to what it does.** It will keep firing on honest refactors and staying quiet on some real breakages.

**Validation deliberately never runs on selection.** AC-5's wording — "the recorded call log holds zero" — is only satisfiable if nothing fires automatically, so validation runs on Save and on an explicit Check. That is also the better behaviour: it is free of provider cost but not free of CPU, and a file nobody is editing does not need re-checking.

## Blockers unblocked by this task

TASK-1845 (the review UI) was blocked by TASK-1843 and this task. Both are now IMPLEMENTED or DONE, so it is eligible.
