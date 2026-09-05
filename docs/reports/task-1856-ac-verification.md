# TASK-1856 — AC verification

**Azure AI Foundry is the review provider, with the model chosen in the pane**

Attended run · 2026-09-05 · two repos
Merged: `choda-deck` PR #269 squash `5e55cfe` · companion PR #104 squash `fd6e65f` · release PR #105 squash `9e20bb8` — all three proven ancestors of their `origin/main`
Release: 0.9.7, adapter sha256 `ca2c676a…225905c4`, byte-identical at both the staging and the packaged path
Gates, each run bare: `choda-deck` tsc 0 / eslint 0 / build 0 / 409 passed + 1 skipped · companion typecheck 0 / lint 0 / build 0 / 481 web + 72 electron
CI: `choda-deck` build-and-test ubuntu + windows + docker-image all pass; companion has no workflows

## Done — 8 of 8

| AC | Proven by | Discriminator |
|---|---|---|
| AC-1 | The one recorded call goes to `{endpoint}/chat/completions` with `api-key` | `x-api-key` and `anthropic-version` asserted **absent**, and no URL contains anthropic.com — sending both auth shapes would satisfy a presence check |
| AC-2 | `resolveAzureConfig` returns null for absent, wrong-provider, and empty-key cases | A CONTROL proves a complete config resolves, so the nulls are not from a function that always returns null |
| AC-3 | `max_tokens` for gpt-4.1-mini, `max_completion_tokens` for gpt-5-mini, each asserted with the other absent | Plus: the reasoning budget is **strictly larger**, and the family matches by prefix so `gpt-5-mini-prod` counts |
| AC-4 | 200 + `finish_reason: length` + empty content → kind `budget` | Asserted equal to `budget` **and not equal to** `parse`; two CONTROLs keep malformed content on `parse` and a refusal on `refusal` |
| AC-5 | The list is exactly the chat-capable, succeeded deployments | A chat-capable deployment named `text-oracle` **is** offered — proving the filter is a capability join, not a name prefix |
| AC-6 | A 503 listing rejects; a review issued afterwards still returns notes | Both layers: the route maps it to 502, and the pane renders the note while the button still works |
| AC-7 | The picked deployment is the request's `model` | Asserted **not equal** to the configured default, with a CONTROL that an untouched picker sends that default |
| AC-8 | No key in any message across 401/429/500/transport | The listing failure is also asserted to carry neither the key **nor the resource name** |

## Injections run

| Injection | Went red | Correct |
|---|---|---|
| `max_tokens` for the reasoning deployment | AC-3's two tests | yes |
| Build the list from `/models` instead of `/deployments` | AC-5's exclusion test | partly — see below |
| Ignore the picked value, always send the default | AC-7's two web tests | yes |

**The second injection is weaker than it looks, and saying so is the point.** It replaced the *result* while leaving the `/deployments` fetch in place, so the test asserting the listing URL stayed green. A stronger injection would have removed the call entirely. The exclusion test — the one that matters — did go red.

## Findings

**Every constant in this task came from a live request, and three of them were not guessable.**

*A reasoning deployment can answer HTTP 200 with an empty string.* At a 300-token budget, gpt-5-mini spent all 300 on reasoning and had nothing left to write with: `finish_reason: length`, content length 0, 387 total tokens. At 2000 it answered normally with 384 reasoning tokens and 489 characters. Falling through to the JSON parser would have reported *"the model answered badly"* — sending the reader to rewrite a prompt when the fix is a number. That is why `budget` is its own kind rather than a message on `parse`.

*The model-listing route is not the obvious one.* `GET {endpoint}/models` returns 428 entries — the catalog of everything the region supports. The resource has six. A picker built from the obvious route would have offered 422 options that answer `DeploymentNotFound`, and the bug would have looked like ours. The correct route also answers only to `api-version=2023-03-15-preview`; the version the chat calls use returns 404 there, which reads like a wrong URL and is a wrong version.

*Chat and embedding are separated by capability, not by name.* Joining each deployment's `model` against the catalog's `chat_completion` flag was verified across all six. A `text-embedding-` prefix rule would have worked today and hidden the first chat model that breaks the convention — which is why the test proves a chat-capable `text-oracle` is still offered.

**Seven tests from TASK-1843 went red on the provider switch, and were repaired rather than deleted.** They are route-level tests of error mapping — which failure becomes which status — and that claim is provider-agnostic and still worth proving. Only the definition of "configured" moved, so the fixture moved with it. Their response-shape stubs moved to Azure's shape; the handful of tests that drive the Anthropic function directly got their own helper.

**The Anthropic path stays in the tree, uncalled.** Deleting it blocks nothing and is reversible, so it was not done under time pressure. Its tests were kept honest instead, because dead code with passing tests is a decision later and dead code with broken tests is an excavation.

**One process slip, caught by the rule that exists for it.** The first typecheck was piped through `grep -v` and reported `exit=1` — the exit status of `grep`, not `tsc`. Re-run bare it was 0. This is precisely the failure the "every gate runs bare" rule prevents, and it surfaced despite the rule being known.

## Still needing a human

Nothing in this task; all eight criteria are machine-class and proven.

Two checks from **TASK-1849** remain and are unaffected by this work — they need no provider at all:
1. Edit a `SKILL.md` in the packaged app, save, confirm `git diff` shows only the changed line.
2. Two windows on one file — the second save must be refused, not silently win.

Those close TASK-1844's AC-6 and with it the TASK-1839 epic.
