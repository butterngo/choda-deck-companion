# TASK-1860 — AC verification

**Grade acceptance criteria before a task reaches READY**

Attended run · 2026-09-05 · two repos
Merged: `choda-deck` PR #272 `824df76` · companion PR #111 `b884b2d`, release PR #112 `204961c` — all proven ancestors
Release: 0.9.10, adapter sha256 `e60797fc…34733591`, byte-identical at the packaged path
Gates via each repo's own scripts: `choda-deck` 1885 passed · companion 515 web + 72 electron
CI: `choda-deck` three checks pass

## Done — 6 of 7

| AC | Proven by | Discriminator |
|---|---|---|
| AC-1 | 501 with zero provider calls | The response is asserted to carry **no criteria** — a 200 with fabricated verdicts is worse than a refusal, and a status-only check would miss it |
| AC-2 | Specific → `ok`, vague → `weak`, in **one** test, asserted not equal | Separate tests would both pass against a grader that always says `weak`. Confirmed live. |
| AC-3 | **Proven live, not by stub** — the claim is about the model's judgement | It cited *"Fails test (3) one verdict"* and split the criterion into AC-3a/AC-3b |
| AC-4 | No `## Acceptance` → 404, zero provider calls, **with a model fully configured** | The check runs before `resolveAzureConfig`, so grading nothing cannot spend money on a working machine |
| AC-5 | Rendering records zero calls | A CONTROL proves the button issues exactly one — without it, "zero" is satisfied by a button that does nothing |
| AC-6 | `updateTask` spy never called; no PUT/PATCH in the web call log | The suggestion **is** returned and rendered, so the test is not passing by the feature being absent |

**Injections:** ok-for-everything → AC-2 red · only-the-mentioned-criteria → AC-3 red · parse past the heading → parser + AC-3 red · grade on mount → AC-5 red. Each hit the right ones and nothing else.

## Not done — AC-7, and it did not merely go unrun

> *Run it against the ten criteria of TASK-1839 and read the verdicts. At least one flagged concern is one a person agrees with, and **no `ok` verdict is given to a criterion that cannot fail**.*

It ran. 4666 ms, 9 `ok`, 1 `weak`.

**First half: met.** The flagged criterion was TASK-1839 AC-2 — *"`PUT` without `if-match` returns 400 and writes nothing"* — with the concern *"'writes nothing' does not specify where to observe that nothing was written"* and the rewrite *"leaves the target file's bytes unchanged on disk (hash remains identical)"*. That is a real improvement I would accept.

**Second half: failed.** TASK-1839's own AC-7 reads *"with no key returns 501 and makes no provider call; against a stubbed provider failure it returns 502"* — two distinct scenarios in one checkbox, a plain violation of test (3). The grader passed it as `ok`.

That is not a near miss. A five-criterion probe run separately shows the grader **catches exactly this pattern**: given *"The export writes a valid file and the import reads it back"* it answered `weak`, cited test (3) by name, and split it into AC-3a/AC-3b. So the capability is there and did not fire on a ten-item list.

**The honest characterisation, which is the deliverable here:**

> The grader is **discriminating but not exhaustive**. A `weak` verdict is trustworthy — every one produced in two live runs was fair. An `ok` verdict is weak evidence: it means *nothing was flagged*, not *this criterion is sound*.

The UI says so. The block is labelled *"judgement, not a check"*, and that label is load-bearing rather than decorative for precisely this reason.

**AC-7 stays unticked and TASK-1860 stays at IMPLEMENTED.** It is human-class: no test can detect "plausible and useless", which is why the criterion was written that way. Butter reads the verdicts and decides.

## Findings

**The transport was extracted rather than copied, and the refactor is what makes the second caller cheap.** `askAzureJson()` now holds the request, the per-family token-field rule and the whole error mapping — including the reasoning-budget case where a deployment returns 200 with an empty body. `reviewFileAzure()` delegates to it and **its 22 tests passed unchanged**, which is the evidence the refactor changed no behaviour. Copying would have meant two places to get the budget case wrong, and the second copy would have been written by someone who had not measured it.

**Only the checkbox lines under `## Acceptance` are graded, and the reason is not token cost.** `ac_check` indexes checkbox lines in that one section. A verdict whose index cannot be pointed back at a checkbox is a verdict nobody can act on — so parsing more would not merely waste tokens, it would silently break the mapping the whole feature depends on. The injection that removes the section boundary reddens both the parser test and AC-3's.

**Every criterion is answered for, mentioned by the model or not.** A criterion missing from the response would render as approved. That is the single direction this feature must never fail in, and the default is `ok` only because the alternative — dropping it — is worse. The summary line (*"2 criteria, none flagged"*) exists so a clean grade is a statement rather than an empty area.

## What this changes about the AI question

Butter asked what AI could do for the companion beyond validating config. This is the answer in one shipped route: **grade the prose the whole system rests on.** Not because a model is clever, but because `/choda-plan` §3d is a written standard that nothing was applying, and applying a written standard to prose is the one job a schema cannot do and a model can.

The measured limit matters as much as the capability. It flags real problems and it misses real problems, so it belongs beside a human's judgement rather than in front of it.
