# Setup tab — redesign proposal

**Reviewed and approved by Butter, 2026-09-05.** Becomes TASK-1859.
Artifact: *Config Triage* — https://claude.ai/code/artifact/8140dc2d-b765-41a3-b38c-d5e9614f57cb

## The complaint

*"tôi cảm thấy nó không được friendly quá khó dùng tôi là 1 developer tôi cần phải dùng được."*

## The diagnosis

The pane makes a person do the machine's job. There are 41 items, and the only way to learn which one is broken is to click each, press Check, read, click the next.

That is a manual scan of a set the app can scan itself — and the fact that makes it fixable was established here and then not used. `POST /claude-config/validate` **reaches no provider and costs nothing** (TASK-1842 AC-1, proven by an injected fetch recording zero calls). It was built free precisely so it could be run liberally. The UI then ran it one file at a time, on demand.

This is a design mistake, not a missing feature. The constraint was known, enforced at the adapter, and ignored one layer up.

## The six changes

| # | Change | Replaces |
|---|---|---|
| 1 | Check everything on open; the header states a verdict | Discovering the verdict by hand, 41 clicks at a time |
| 2 | Severity marker and a short reason **in the row** | Findings visible only after selecting |
| 3 | Findings anchored to their line, that line tinted | A block below the file, below the fold |
| 4 | The paid control styled as paid — violet, its own end of the bar, model name, *costs money* | Edit / Check / Ask at identical weight |
| 5 | `/` to filter, arrows to move, Enter to open, Ctrl+S to save | Scrolling a list of 41 |
| 6 | Save previews only the changed lines before writing | Trusting the write, then checking `git diff` |

`line` is already in the finding payload and currently unused, so change 3 costs nothing to feed.

Change 6 is AC-2 of TASK-1849 moved into the product: the claim the whole feature rests on is *a save changes only what you changed*, and showing it turns a promise into something the reader approved.

## What must not change

**Model notes stay marked as opinion** — the violet tag and the words *judgement, not a check*. A finding is a fact about the file; a note can be confidently wrong, and rendering them alike is how a wrong judgement inherits a check's authority (TASK-1845 AC-4).

**The cost boundary stays where it is.** TASK-1845 AC-1 — open, save and re-select record zero calls to `/review` — must keep passing unmodified. A sweep of free checks must not quietly become a sweep of paid ones. TASK-1859 AC-4 restates it so the regression is caught rather than assumed away.

## Three uncertainties, stated rather than papered over

**The sweep's cost is unmeasured.** The inventory read was timed at 10 ms + 5 ms; the check has never been timed across a whole workspace. TASK-1859 AC-7 turns this into a number *before* the design depends on it, and requires the list to render before the sweep finishes. If it is slow, the honest fallback is streaming results in — not returning to one file at a time.

**The severity dot competes with the MCP status chip.** A server can be both not-running and carrying a finding. The mockup collapses them into one dot plus a short reason. That may lose something, and it is worth driving against a real workspace before committing.

**A diff view is a small feature that grows.** Word-level highlighting, large files, binary refusal. Line-level only, and stop there.

## Design notes

Palette and type follow the app rather than introducing a second visual language: zinc neutrals, sentence case, weight ≤ 500, no emoji. Violet stays reserved for the one action that spends money. The severity scale is deliberately **not** the accent colour — "this is broken" must not read as "this is clickable".
