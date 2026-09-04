# TASK-1845 — AC verification

**Web: ask for a review, and show that it cost something**

Run: `/choda-burn-backlog`, iteration 5 · 2026-09-04 · workspace `choda-deck-companion` (unchanged from iteration 4)
Merged: PR #102, squash `d5eaa01`, proven ancestor of `origin/main`
Gates: `typecheck` / `lint` / `build` exit 0, each run bare · `pnpm test` 477 web + 72 electron (was 471 + 72)
CI: this repo has **no `.github/workflows` directory at all** — `gh pr checks` reporting "no checks reported" is a structural all-clear, not the race iteration 1 lost

## Done — 4 of 4

| AC | Class | Proven by | Discriminator |
|---|---|---|---|
| AC-1 | machine | Open, save and re-select record **zero** calls to `/claude-config/review` | A CONTROL asserts the button issues exactly one — without it, "zero calls" is also satisfied by a button that does nothing |
| AC-2 | machine | A stubbed 501 renders `setup-review-unconfigured` in a `CapabilityNote` | The **absence** of `setup-review-error` is asserted, not merely the presence of the note |
| AC-3 | machine | 502 driven twice, `kind: rate_limit` then `kind: network`, both messages captured | Asserted **not equal** — one shared generic failure would pass a per-kind presence check |
| AC-4 | machine | Notes and findings render in containers where neither contains the other, each item resolved via `within()` its own block | A CONTROL: `notes: []` renders a stated "nothing to add", because an empty area is indistinguishable from a review that never ran |

## The injection

The task's own Test Plan named one: *call review when a row is selected — AC-1 must go red.* It did — **and so did three other tests.**

`AC-4 — the path is shown and copyable, and nothing is written` (TASK-1830) and `AC-5 — reading a file is still only GET` (TASK-1831) both went red, because review is a `POST` and those guards assert the whole call log holds nothing but `GET`. AC-1's own CONTROL went red too, since the count became 2.

That was not designed; it is worth recording anyway. **Two guards written months apart for a different reason caught this defect before the criterion written for it did.** The "nothing but GET" assertion turns out to be a general cost-and-safety boundary, not the narrow read-only claim it was written as.

## Findings

**The cost boundary is now enforced in two independent places, which is the point.** TASK-1843 made it structural at the adapter — `/validate` is free and reaches no provider, `/review` is the only paid path, and no parameter on the first can become the second. That prevents an accidental charge from a server bug. It does nothing about a UI that calls the paid route from a `useEffect`.

This task is the other half: `reviewClaudeConfig()` has exactly one call site, the button's `onClick`. Neither half is sufficient. A flag on one route would have made the adapter's guarantee un-testable; an effect in the view would have made it irrelevant.

**A note and a finding got separate types, not a shared one with a `source` field.** The tempting design is `ConfigFinding & { source: 'check' | 'model' }` — less code, one render path. It is the wrong one. A finding is a fact: a missing `description` field is missing, and the check cannot be wrong about it. A note is a judgement that can be confidently incorrect. Sharing a shape means sharing a renderer, and a shared renderer is how a wrong judgement inherits a check's authority in the reader's eye.

AC-4 encodes this as a DOM assertion — neither container contains the other — rather than as a comment, so a later refactor that merges the lists fails rather than passing quietly.

**The 501 is drawn as an invitation.** On most machines no model is configured, so an error-styled "review unavailable" would be the *normal* rendering. A reader who sees red on every file learns to skip red. The `CapabilityNote` says what the feature would do if set up, which is the only thing worth saying in that state.

## Blockers

None. TASK-1845 was the last task in the TASK-1839 chain.

## Still needing a human

Nothing in this task. The chain's two human checks live in **TASK-1849** (TODO): after a release vendors the three new routes into `electron/vendor/companion-server.cjs`, confirm that a save from the packaged app produces a `git diff` of only the changed lines, and that two windows editing one file produce the conflict rather than a silent overwrite. Until that release, all three adapter routes exist on `choda-deck` main and in no installed app.
