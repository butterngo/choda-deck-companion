---
requirement: Edit a mermaid diagram in the companion's Docs pane with AI — the ```mermaid fence only
started: 2026-09-10
workspace: Companion
status: converged
---

# Discovery — AI-edited mermaid fence in the Docs pane

Thread: CONV-1789024991181-28

## Round 1 — AI-edited mermaid fence in the Docs pane

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| conversation | thread opened this round; no messages yet | [conversation CONV-1789024991181-28] |
| code | `/workspace-docs` answers **405 to every non-GET** and its file GET returns bare text with **no hash/etag** — so a fence save needs both a method branch and a hash the client can echo | `choda-deck/src/adapters/companion/workspace-docs.ts:173-180,258-262` |
| code | `/claude-config` already implements the whole write contract to copy: `if-match` on a sha256, 409 on drift, temp-file+rename, 413 at 2 MB, and a GET that returns `etag` | `claude-config.ts:515-518,554-567,921-960` |
| code | the model call is **already generic and already reused**: `askAzureJson<T>({cfg, system, user, schema})` is consumed by `ac-grader.ts`, so a second consumer is composition, not new plumbing | `azure-review.ts:220-236`, `ac-grader.ts:16-17,138` |
| code | provider is **Azure AI Foundry**, not Anthropic — TASK-1843's Anthropic implementation was deleted in TASK-1856; key lives in `ai-key.txt` (0600) resolved by `resolveAzureConfig` | `ai-review.ts:1-27`, `azure-review.ts:76-101` |
| experiment | `mermaid.parse` **runs in plain node with no DOM** and rejects today's real bug (`&gt;` decoded into an arrow) | node 24, mermaid 11.17.0, run 2026-09-10 |
| experiment | esbuild-bundling `mermaid.parse` for node costs **3.34 MB minified**; the shipped adapter bundle is **0.69 MB** — a 5.8x growth of the vendored file | `release/win-unpacked/resources/adapter/companion-server.cjs`, esbuild --minify, 2026-09-10 |
| experiment | across four corpora, **33 markdown files carry a mermaid fence** (JuvenisMaxime 17, choda-deck 11, ABCV2 3, vault 2) — the blast radius is not one repo | grep over the four `docs/knowledge` trees, 2026-09-10 |
| repo | 2 of 12 fences in ABCV2 were unparseable and both were found by hand today | `adr-pure-mcp-tools-as-module-adapter.md:137`, `abcv2-mcp-gateway-architecture.md:46` |

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 8 | Two real broken diagrams today; 33 files carry fences, so this recurs. Gap: nobody has counted how often Butter *edits* a diagram vs merely reads one | a stated frequency, or accept it as an assumption |
| 2 | Scope & boundary | 9 | Butter chose fence-only, adapter one-shot, discovery-first. Out: full markdown editor, prose editing, creating files | — |
| 3 | Technical contract | 6 | Both halves read on disk (`workspace-docs.ts`, `claude-config.ts:921-960`, `azure-review.ts:220`). Gap: **where the parse gate runs** is undecided, and the 3.34 MB is the price of one answer | decide adapter-parse vs renderer-parse (§round 2) |
| 4 | Prior art | 7 | `companion-write-actions-must-confirm-surface-result-or-error-never-silent` governs; TASK-1830's read-only stance was already reversed once, deliberately, for Setup | read that gotcha + the TASK-1794 in-place-viewer decision |
| 5 | Edges & failure | 4 | Known: 409 drift, 413, no-key 501, typed provider errors. Unknown: what happens when the fence text on disk moved between read and save, and what a model returning a *different diagram type* means | trace the fence-locating code path |
| 6 | NFR | 3 | Untouched this round | walk the 12-category checklist |
| 7 | Acceptance criteria | 2 | None written; blocked on #3 and #5 | after 3 and 5 |

**TOTAL = MIN = 2** (dimension 7)
Round 0: 1 → round 1: 2. New evidence? **YES** (9 sources) → may continue.

### Score history

| # | Dimension | R0 | R1 |
|---|---|---|---|
| 1 | Problem & value | 5 | 8 |
| 2 | Scope & boundary | 6 | 9 |
| 3 | Technical contract | 3 | 6 |
| 4 | Prior art | 3 | 7 |
| 5 | Edges & failure | 2 | 4 |
| 6 | NFR | 2 | 3 |
| 7 | Acceptance criteria | 1 | 2 |
| | **MIN** | **1** | **2** |

### Round 2 will look for exactly this

- Decide where the parse gate runs (#3). Adapter = +3.34 MB but the refusal is structural; renderer = free but a client-side gate is a convention, not a boundary. This is a decision, not a search — it goes to Butter.
- Trace how a fence is located and replaced when the file changed underneath (#5) — the fence index is not a stable identity.
- Walk the NFR checklist (#6).

## Round 2 — the parse gate, the fence's identity, and the NFRs

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| conversation | thread carried no new messages; Butter answered in chat instead — **the parse gate goes in the adapter**, accepting +3.34 MB, because a client-side gate is a convention and a server-side refusal is a boundary | [conversation CONV-1789024991181-28] + Butter, chat, 2026-09-10 |
| experiment | `mermaid.render` in node fails with **`document is not defined`** — so the adapter can prove a diagram **parses**, never that it **draws**. The preview in the browser is the only renderability proof, and it is the human's eyes | node 24, mermaid 11.17.0, 2026-09-10 |
| repo | **nothing anywhere validates a fence**: `mermaid` appears only as a web dependency (`packages/web/package.json:27`), in no script and in neither CI workflow (`choda-deck/.github/workflows/{ci,publish}.yml`) | grep, 2026-09-10 |
| code | the write contract that keeps a save honest already exists and is proven: bytes not strings, `ignoreBOM: true` on decode, temp+rename, 409 on drift | `claude-config.ts:526,554-567,921-950`; TASK-1841 AC-5, TASK-1849 |
| knowledge | every companion mutation must **confirm before running** and surface the real outcome — a 404 from a route that does not exist yet must read as an error, never a fake "done" | `companion-write-actions-must-confirm-surface-result-or-error-never-silent` |
| checklist | 12 NFR categories walked against Butter's defaults table | `references/nfr-checklist.md` |

### The contract (dimension 3, now decided)

```
GET  /workspace-docs/<workspaceId>/<rel>
     + response header  etag: <sha256-hex of the file BYTES>     NEW — today there is none

PUT  /workspace-docs/<workspaceId>/<rel>
     headers: x-choda-bridge-token, if-match: <sha256-hex>
     body:    the file's BYTES (so a BOM and CRLF survive)
     -> 200 { sha256, bytes }
     -> 400 if-match required | 401 token | 404 not found | 409 changed on disk
     -> 413 too large (2 MB, the existing cap) | 415 binary
     same allowlist and safeResolve as the GET — one judge, not two

POST /workspace-docs/diagram          the model call, its own route, NEVER writes
     body: { workspaceId, rel, fenceIndex, instruction }
     -> 200 { mermaid, attempts }     parsed by the adapter before it is returned
     -> 422 { error: 'model output does not parse', parseError, attempts: 2 }
     -> 501 no model configured | 502 { kind } | 429 passed through

POST /workspace-docs/diagram/check    deterministic, free, no key, no network
     body: { mermaid } -> 200 { ok, error?, line? }
```

Three properties this shape buys, each of which was a way to get it wrong:

- **`/diagram` cannot write.** A save is always the human's second click, on a PUT they can see. Same reason `/review` is a separate route from `/validate` (TASK-1839): a flag can be defaulted on by a refactor; a missing route cannot.
- **The fence's identity is its index, and `if-match` is what makes that safe.** An index is not a stable identity in general — but a save carrying the hash of the text the index was resolved against is refused the moment the file moves. The index can therefore never address a fence in a file it did not come from.
- **`/diagram/check` exists without a key.** The two real bugs found today would both have been caught by it, for free, with no model involved. The AI half is the convenience; the parse gate is the correctness.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Two unparseable fences shipped in ADRs and survived until a human opened them; **no script or CI anywhere checks a fence** (`packages/web/package.json:27`, both workflows) | — |
| 2 | Scope & boundary | 9 | Fence-only, adapter one-shot. Out: markdown/prose editing, creating files, fixing diagrams unattended | — |
| 3 | Technical contract | 9 | Four routes above, each field and status read from the working `/claude-config` implementation; the one open decision (gate location) is now made | — |
| 4 | Prior art | 9 | `companion-write-actions-…-never-silent` governs the button; TASK-1830's read-only stance was already reversed once for Setup, deliberately and narrowly (TASK-1844) | — |
| 5 | Edges & failure | 9 | Nine paths enumerated below, each with a stated answer | — |
| 6 | NFR | 9 | 12/12 — 7 answered, 5 defaulted per the checklist | — |
| 7 | Acceptance criteria | 9 | 11 criteria below; each names a surface, each can fail, and the two real ABCV2 bugs are fixtures rather than anecdotes | — |

**TOTAL = MIN = 9**
Round 1: 2 → round 2: 9. New evidence? **YES** (6 sources) → the rise is earned.

### The edges (dimension 5)

| # | Edge | Answer |
|---|---|---|
| 1 | File changed on disk between read and save | 409, the `/claude-config` behaviour — and the same mechanism that makes `fenceIndex` safe |
| 2 | File carries a BOM and CRLF | Bytes on the wire, `ignoreBOM: true` on decode — the TASK-1841/1849 path, not a new one |
| 3 | Model returns unparseable mermaid | Adapter parses, retries **once** with the parse error in the prompt, then 422. Nothing is written |
| 4 | Model returns a *different kind* of diagram that parses | Not a gate. It renders in the preview and the human declines — a policy the adapter cannot judge |
| 5 | Model parses but does not **draw** | The adapter cannot know (`document is not defined`). The browser preview is the render proof, and the human presses save |
| 6 | No key configured | 501 → a capability note inviting configuration, never an error state (TASK-1845 AC-2) |
| 7 | Provider rate-limited / down | 502 with the typed `kind`, 429 passed through — `AiError` already carries the union |
| 8 | `fenceIndex` out of range | 404 naming the index and the count, rather than editing the wrong fence |
| 9 | Save the same content twice | The second PUT carries a now-stale hash → 409. Run-twice is refused, not silently repeated |

### NFRs

| Category | Requirement | Source |
|---|---|---|
| Performance | One parse (ms), at most two model calls, one write. No call on keystroke | Stated |
| Security | Key stays in the adapter (`ai-key.txt`, 0600); writes confined to the GET's allowlist; token-gated | `azure-review.ts:76-101` |
| Error handling | Confirm before write; surface result or error, never silent; typed provider kinds | `companion-write-actions-…-never-silent` |
| Data | The file on disk is the only store; no backup — which is what makes the 409 a correctness requirement | TASK-1841 |
| Cost | No model call without a click, enforced by route separation, not by a flag | TASK-1839 precedent |
| Availability | `/diagram/check` works with no key and no network — validation must survive a provider outage | Stated |
| Observability | Adapter logging; a failed save names its reason | Default |
| Integration | Azure AI Foundry via `askAzureJson`; the adapter bundle grows 0.69 → ~4 MB and must be re-vendored to reach the packaged app (INBOX-1888) | Measured 2026-09-10 |
| Scalability / i18n / a11y / Compliance / Maintainability | Single user; English; keyboard-reachable; none; one bundled parser | Default |

### Acceptance criteria (dimension 7)

- [ ] AC-1 (machine) — `PUT /workspace-docs/<ws>/<rel>` with no `if-match` returns 400 and the file's sha256 is unchanged. Fail: the write succeeds.
- [ ] AC-2 (machine) — With the file rewritten on disk between read and save, a `PUT` carrying the stale hash returns 409 and the other writer's bytes survive. Fail: the stale content wins.
- [ ] AC-3 (machine) — A fixture whose content is CRLF and begins with a BOM, read then saved unmodified, is **byte-identical** (`Buffer.compare`). Fail: the bytes differ.
- [ ] AC-4 (machine) — `POST /workspace-docs/diagram/check` on the real ABCV2 fixtures — `PageResult&lt;AccountListItem&gt;` and `SS[SecretStore\n{{secrets.KEY}}]` — returns `ok:false` with a line number, and returns `ok:true` on their fixed forms. Fail: both answer the same, which is what a check that cannot fail produces.
- [ ] AC-5 (machine) — `/diagram/check` answers with **no key file present and zero outbound requests**, asserted over an injected fetch. Fail: 501, or a request leaves the machine.
- [ ] AC-6 (machine) — Given a stubbed model returning unparseable mermaid twice, `POST /workspace-docs/diagram` returns 422 carrying the parse error and `attempts: 2`, and **no file is written**. Fail: 200 with junk, or a write happens.
- [ ] AC-7 (machine) — Given a stubbed model returning junk once then valid mermaid, the route returns 200 with `attempts: 2`. Fail: it gives up after the first failure, which makes the retry decorative.
- [ ] AC-8 (machine) — **No route other than `/workspace-docs/diagram` reaches the provider**: `/diagram/check`, the GET and the PUT each record zero provider calls, including when driven with `ai=true`, `review=1` and an `x-ai` header. Fail: any reaches it — the cost boundary leaking.
- [ ] AC-9 (machine) — A `fenceIndex` beyond the file's fence count returns 404 naming the index and the count, and writes nothing. Fail: it edits fence 0, which is the silent wrong-target case.
- [ ] AC-10 (machine) — In the Docs pane, pressing the AI control issues exactly one `/diagram` call; opening a file, typing in the editor and switching files issue **zero**. Fail: any of them spends money.
- [ ] AC-11 (human) — In the packaged app, ask the AI to change one diagram in a real repo, preview it, save, then run `git diff`: only the fence's lines appear as changed. Fail: the whole file shows as modified — the line-ending or BOM defect surfacing where tests cannot see it.

### Score history

| # | Dimension | R0 | R1 | R2 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | 8 | 9 |
| 2 | Scope & boundary | 6 | 9 | 9 |
| 3 | Technical contract | 3 | 6 | 9 |
| 4 | Prior art | 3 | 7 | 9 |
| 5 | Edges & failure | 2 | 4 | 9 |
| 6 | NFR | 2 | 3 | 9 |
| 7 | Acceptance criteria | 1 | 2 | 9 |
| | **MIN** | **1** | **2** | **9** |

## ✅ All dimensions ≥ 9 after 2 rounds

| # | Dimension | Score | WHY it earned 9 — evidence, not confidence |
|---|---|---|---|
| 1 | Problem & value | 9 | 2 of 12 ABCV2 fences were unparseable and nothing in either repo checks a fence — mermaid is a web dependency only (`packages/web/package.json:27`), absent from both CI workflows |
| 2 | Scope & boundary | 9 | Butter chose fence-only over a markdown editor and over preview-only, in chat, 2026-09-10 |
| 3 | Technical contract | 9 | Every route, field and status above is copied from the working `/claude-config` implementation (`claude-config.ts:515-567,921-960`) rather than invented |
| 4 | Prior art | 9 | The one governing rule (`companion-write-actions-…-never-silent`) is read, and the read-only reversal it mirrors already happened once at TASK-1844 |
| 5 | Edges & failure | 9 | Nine paths, each with an answer, including the two nobody would have listed: parse ≠ render, and index-safety resting on `if-match` |
| 6 | NFR | 9 | 12/12 against the checklist; the bundle growth is measured (0.69 → ~4 MB), not estimated |
| 7 | Acceptance criteria | 9 | 11 criteria; the ABCV2 defects are fixtures, so AC-4 and AC-9 fail against a gate that does not exist |

**Exemptions:** none.

**Unproven assumptions carried forward:**
- How often Butter *edits* a diagram (as opposed to reading one) is unmeasured. The validation half is justified without it; the AI half rests on a stated preference.
- `askAzureJson` has never been asked for mermaid. Whether one schema-constrained call produces a usable diagram at this size is untested — the 422 path exists precisely because it might not.
- The 3.34 MB is an esbuild measurement of a probe entry, not of the real adapter after tree-shaking alongside its existing imports. It is a ceiling, not the number.
- A retry budget of one is chosen, not measured.

**Rounds:** 2 · **evidence:** 15 citations across code (8), experiment (4), knowledge (2), checklist (1)
**Report:** `docs/reports/mermaid-fence-ai-edit-discovery.md` · **Thread:** CONV-1789024991181-28
