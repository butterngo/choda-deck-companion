---
requirement: "nếu tôi muốn làm thêm tính năng edit và save thì sao, ngoài ra tôi muốn tích hợp thêm AI vô nữa thì làm sao, về AI thì bạn mở english-companion để tham khảo, tôi muốn tích hợp vào để hổ trợ validate template, ngoai ra có thể tôi cần tích hơp thêm mấy cái docker management trên mấy cái project nữa có thể để có nguyên 1 cái jouney hoàn thiện"
started: 2026-09-04
workspace: Companion (choda-deck-companion)
status: converged
---

# Discovery — edit + save, AI-assisted validation, and Docker management in the companion

## Round 1 — three requirements in one sentence, and one of them reverses yesterday

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| code | english-companion calls the model **browser-direct, no proxy**: `api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true` and the user's key from device storage | `english-companion/src/lib/claude.js:1-60` |
| code | It is **multi-provider** — `resolveProvider()` targets Anthropic, Azure OpenAI on AI Foundry, and Gemini, each with its own url/headers/model | `src/lib/claude.js:1-30` |
| code | Every call is **schema-constrained** (`output_config.format = json_schema`), and failures are a typed `ClaudeError` with `kind ∈ no_key\|auth\|rate_limit\|network\|refusal\|parse\|api`. `fetch` is injectable for tests | `src/lib/claude.js:36-42` |
| ADR | ADR-001 flags the key-in-browser stance as acceptable **only** because this is a single-user local tool, and says in terms: *"Not safe for a multi-user or hosted deployment."* It also names `output_config.format` + the dangerous-direct header as **load-bearing API assumptions** — if either changes, both modes break | `adr-001-english-companion-phase-1-architecture-…` |
| ADR | ADR-001 is **stale**: all four pinned refs have drifted (8, 13, 7 and 9 commits since). The architecture is right in outline; specific field names must be read from the file, not the ADR | `knowledge_get` staleness, read 2026-09-04 |
| knowledge | A companion write-action must **confirm first and surface result or error, never silently** | `companion-write-actions-must-confirm-surface-result-or-error-never-silent` |
| knowledge | Secret-carrying capture kinds are **local-only** and must never reach inbox/task — the precedent for "this data does not leave the machine" | `secret-carrying-capture-kinds-are-local-only-never-inbox-task` |
| disk | "Template" is ambiguous across the projects in play: **11** knowledge entries mention templates in `NewJuvenisMaxime` (mission/screen templates, `template-registry.json`), **6** in choda-deck (task/AC templates), **0** in the companion | `docs/knowledge` greps, 2026-09-04 |
| disk | choda-deck has a `Dockerfile` and `docker-compose.yml`; the companion has neither | repo roots, 2026-09-04 |

### The thing that has to be said first

**This is three requirements, not one**, and they have different risk profiles:

1. **Edit + save** — reverses a decision made *yesterday*. When asked what "editable" meant, the answer was explicitly *read + open in the real editor, the companion writes nothing*, and "in-app editing" was named as out of scope. That decision is now shipped in 0.9.5. Reversing it is entirely allowed — but what changed is evidence I do not have, and it matters: if the answer is "I tried it and pasting a path is annoying", the fix might be the editor-launch option that was rejected for cost, not a write path.
2. **AI-assisted validation** — depends entirely on what "template" means, which nothing on disk settles.
3. **Docker management** — a different subsystem, a different blast radius, and no existing surface in the companion at all.

"Một journey hoàn thiện" is a goal, not a scope. A journey is only complete against a stated flow; right now three capabilities are named and the flow that joins them is not.

### What english-companion actually hands us

The pattern is reusable and the constraint that comes with it is not.

**Reusable:** a single injectable entry point, provider resolution from settings, schema-constrained output so responses are renderable and testable, and a typed error union so each failure gets one actionable message. `claude.test.js` exists because `fetch` is injectable — the same shape would make AI validation testable here without a network.

**Not reusable as-is:** english-companion is a browser-only PWA with no backend, so the key *has* to live in the browser and ADR-001 accepts that with a stated warning. The companion is **not** that shape — it ships a local adapter process, which is a natural place to hold a key so it never reaches the renderer. The bridge token already works exactly that way: `main.cjs:166-170` keeps it in the main process and the proxy injects it, *"never reaches the renderer"*. Copying the browser-direct stance into an app that has a server would be inheriting a constraint we do not have.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | Stated first-hand, but unsized; and the edit/save half contradicts a 24-hour-old decision without a stated reason | what changed since read-only was chosen |
| 2 | Scope & boundary | 2 | Three features in one sentence; "validate template" names no template; "journey" names no flow | a human call — no search settles it |
| 3 | Technical contract | 5 | The AI half is read from real code (`claude.js`, ADR-001). The write half and the Docker half have no contract at all | decide the shape, then read the surfaces |
| 4 | Prior art | 6 | Write-actions and local-only gotchas found and read; ADR-001's key-stance constraint is explicit | ADR-036's LOCAL-ONLY guard unread; no check whether AI-in-companion was previously rejected |
| 5 | Edges & failure | 2 | untouched | blocked on #2 |
| 6 | NFR | 2 | untouched — and cost/quota is a real NFR here for the first time in this repo | walk the checklist once scope exists |
| 7 | Acceptance criteria | 1 | none exist | blocked on #2 and #3 |

**TOTAL = MIN = 1** (dimension 7)
Round 0: all assumption → round 1: MIN 1. New evidence? **YES** (9 sources) → the loop may continue, but §5 stops it anyway.

### Score history

| # | Dimension | R1 |
|---|---|---|
| 1 | Problem & value | 5 |
| 2 | Scope & boundary | 2 |
| 3 | Technical contract | 5 |
| 4 | Prior art | 6 |
| 5 | Edges & failure | 2 |
| 6 | NFR | 2 |
| 7 | Acceptance criteria | 1 |
| | **MIN** | **1** |

### Stop condition — §5, blocked on a human decision

Dimension 2 is the lowest and no amount of reading raises it. Four questions, none of which a search can answer:

1. **Which template?** Mission/screen templates in JuvenisMaxime (`template-registry.json`), task/AC templates in choda-deck, or the config files the Setup tab already lists (`SKILL.md` frontmatter, `.mcp.json` shape)? The last would make this one coherent feature with edit+save; the first two make it a different product.
2. **What changed about read-only?** Yesterday the answer was "path + copy, the companion writes nothing", and that shipped. Naming what went wrong decides whether the fix is a write path, the editor launch that was rejected on cost, or something else.
3. **One journey or three features?** If a journey, name the flow end to end — "open a project → see its config → ask AI to check it → fix it → restart its containers" is a sentence I can score; three capabilities is not.
4. **Where does the key live?** english-companion puts it in the browser because it has no server. The companion has an adapter that already holds a secret the renderer never sees. Same stance, or use the server we have?

Nothing converts until these are answered. The loop stops here rather than manufacturing scope.

## Round 2 — "all templates" turns out to mean a schema already exists, and most of validation is a diff

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| Butter | (1) **all** templates, (2) *"có thể sửa file được thôi"* — editing files is the want, (3) yes, one journey, (4) asked what "use the existing adapter" means, and added: *"nhiêu khi tôi cần phải có thêm prompt or mcp or skill để có hổ trợ thêm thì có được không"* | chat, 2026-09-04 |
| disk | `docs/template-registry.json` is **117 KB** and holds `$schemaVersion`, `generatedAt`, `source`, `typeLegend` (4 kinds) and **57 templates** — a machine-readable content-key schema per template | `NewJuvenisMaxime/docs/template-registry.json`, read 2026-09-04 |
| **reproduced** | Reading it with plain UTF-8 threw `Unexpected UTF-8 BOM (decode using utf-8-sig)` — **the exact failure the knowledge base already records**, hit first-hand on the first attempt | live, 2026-09-04 |
| knowledge | That BOM failure previously took `list_templates` and `get_template_schema` down while `list_projects` kept working — a partial outage that looks like a feature bug | `json-written-on-windows-carries-a-utf-8-bom-…` |
| knowledge | **An MCP server for this already exists**: `jsp-project` reads the registry at runtime and caches it per-process (`tools/project-mcp/src/registry.ts:34`), exposing `list_templates` / `get_template_schema` | `template-registry-json-drifts-when-fe-templates-are-added-…` |
| knowledge | The real pain is **drift, not malformed templates**: the registry is hand-extracted and nothing regenerates it. A merge added `table-4` to the renderer and the registry stayed at 56. Docs claimed 56 for a month | same entry |
| knowledge | And the drift hid behind compensating errors: the catalog header read "16 Informational · 37 Interactive · 3 Borderline" — summing to 56 correctly while **both columns were wrong**. Now 15 · 39 · 3 | same entry |
| knowledge | The automation for this is already ticketed and not done: **TASK-1384** (regeneration script + CI drift check) | same entry |

### The finding that reshapes the AI question

**Most of "validate template" is a diff, not an AI problem.**

The registry already *is* the schema. Checking that a template conforms to it, that renderer keys are a subset of registry keys, that the catalog count matches the registry count — every one of those is a script with an exact answer, and the last two are already ticketed as TASK-1384. An LLM asked to do them would give a probabilistic answer to a deterministic question, which is strictly worse: it can be wrong, and it cannot be diffed.

That does not remove AI from the picture; it relocates it. AI earns its place exactly where a schema cannot express the rule:

- is this template's copy actually *saying* what its `typeLegend` kind claims
- are these two templates near-duplicates (the entry names `career-skill-check` vs `table-4` as a real pair)
- does this acceptance criterion actually falsify, or is it a wish
- does this `SKILL.md` description say when to trigger, or just what it does

Note what those have in common: **they are judgements about prose, made against a stated standard.** They are also the only ones a deterministic checker cannot make.

**So the honest shape is: schema first, AI second, and the AI never asked a question the schema can answer.** A validator that runs the deterministic checks and *then* asks the model about what is left is both cheaper and more trustworthy than one that asks the model everything.

### What "use the existing adapter" means — the answer to Q4

english-companion has **no server**. It is a browser PWA, so the API key has to live in the browser and ADR-001 accepts that with a written warning.

The companion is not that shape. It ships a **local Node process** (the adapter) that the web page talks to over `127.0.0.1`. That process already holds a secret the page never sees: the bridge token, kept in the main process while the proxy injects it — *"never reaches the renderer"* (`main.cjs:166-170`).

So "use the existing adapter" means: the API key lives in the adapter, the page asks the adapter to run a validation, and the key is never in the renderer, never in `localStorage`, never in a devtools network tab. Same user, same machine, strictly less exposure — and it costs nothing extra, because the process and the token plumbing already exist.

### The fork Butter's own question opens

*"Nhiêu khi tôi cần thêm prompt or mcp or skill"* is not a small addition. It decides what is being built:

| | What it is | Cost | What it can do |
|---|---|---|---|
| **A. One-shot, schema-constrained** | english-companion's shape: one call, `json_schema` output, typed errors | small, testable without a network | judge text you hand it. Cannot look anything up |
| **B. An agent inside the companion** | a tool-calling loop with MCP servers and skills | large — tool registry, turn loop, cost control, failure modes | fetch the registry, read files, cross-check — and be extended with prompts/MCP/skills exactly as asked |
| **C. Hand the job to Claude Code** | the companion composes the request; the agent that already has MCP + skills does the work | smallest — no AI runtime in the companion at all | everything B can do, because it **is** B, already built and already extensible |

Option C deserves saying out loud: **an agent with prompts, MCP servers and skills already exists on this machine and is the thing you are talking to now.** Building a second one inside the companion means maintaining a tool loop, a provider matrix and a cost story that Claude Code already has — and the extensibility asked for in the question is precisely what C gets for free.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 7 | Now sized for the template half: 117 KB registry, 57 templates, hand-maintained, a real month-long drift with compensating off-by-one errors, TASK-1384 open | why read-only stopped being enough — still a want, not a reason |
| 2 | Scope & boundary | 5 | "all templates", "one journey", "edit files" answered; the prompt/MCP/skill question opens a new axis and nothing is out yet | the A/B/C decision, and one sentence of journey |
| 3 | Technical contract | 6 | AI client read; registry shape read; BOM failure reproduced first-hand; an MCP server for templates already exists | `registry.ts` unread; no write contract at all |
| 4 | Prior art | 8 | write-actions + local-only gotchas, ADR-001's key constraint, the drift learning, the BOM learning, TASK-1384 | ADR-036's LOCAL-ONLY guard still unread |
| 5 | Edges & failure | 4 | One edge reproduced live (BOM breaks the reader, partial outage), plus the drift/staleness class | the write path's edges — concurrent edit, invalid save, no backup |
| 6 | NFR | 2 | untouched, and cost/quota is material here for the first time in this repo | walk the checklist once A/B/C is decided |
| 7 | Acceptance criteria | 1 | none exist | blocked on #2 |

**TOTAL = MIN = 1** (dimension 7)
Round 1: MIN 1 → round 2: MIN 1. New evidence? **YES** (8 sources) → the loop may continue; §5 stops it on the decision instead.

### Score history

| # | Dimension | R1 | R2 |
|---|---|---|---|
| 1 | Problem & value | 5 | 7 |
| 2 | Scope & boundary | 2 | 5 |
| 3 | Technical contract | 5 | 6 |
| 4 | Prior art | 6 | 8 |
| 5 | Edges & failure | 2 | 4 |
| 6 | NFR | 2 | 2 |
| 7 | Acceptance criteria | 1 | 1 |
| | **MIN** | **1** | **1** |

**Reading the MIN row honestly:** it has not moved, and that is not the loop spinning — five of seven dimensions rose on eight fresh citations. Dimension 7 is pinned at 1 by dimension 2, and dimension 2 is pinned by a decision, not by missing information. One answer unblocks the column.

### Stop condition — §5, blocked on a human decision (second time, different question)

**A, B or C** for the AI runtime. Everything downstream depends on it: the contract, the NFRs (cost, quota, latency all only exist in B), the edges, and every acceptance criterion.

Secondary, cheap to answer alongside it: what is explicitly **out**? "All templates" plus "docker management" plus "edit and save" with no stated exclusion is a scope that cannot be finished, and a journey is defined as much by where it ends as where it starts.

## Round 3 — the decision, taken on delegation, and what it does to the scores

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| Butter | *"tùy bạn đi cái này là tốt nhất thì okay thôi"* — the A/B/C call and the scope boundary are delegated | chat, 2026-09-04 |
| code | The adapter **does** write files today — but only into storage it owns: capture artifacts and the bridge token, never a user source tree and never `~/.claude` | `capture-artifacts.ts:57,60,201,204,212,215`; `bridge-token.ts:33-34` |
| code | `bridge-token.ts:34` writes with `mode: 0o600` — the precedent for "a file this app creates is not world-readable" | `bridge-token.ts:34` |
| code | The capture path validates in **two layers**: an envelope contract (malformed → 400) and a per-kind payload check, with 501 reserved for "contract valid, cannot route yet" | `capture-contract.ts:1-22,143-165` |
| reasoning | There is **no synchronous path** from a companion button to a Claude Code session. The only bridge is `POST /capture` → inbox/task/conversation/knowledge — asynchronous by construction | `capture-dispatcher.ts` destinations, read this round |

### The decision

**A — one-shot, schema-constrained, key held by the adapter — with a deterministic layer in front of it, and C kept as an escape hatch.**

Four reasons, in the order that decided it:

1. **Most of the work is a diff.** Round 2 established that schema conformance, renderer-key subset and catalog counts all have exact answers. Determinism first means the model is only ever asked what a schema cannot express.
2. **B's main advantage evaporates on inspection.** The lookup an agent would exist to perform — fetch the template schema — is a local file the adapter can read and pass in. Once the caller supplies the schema, a tool loop buys nothing but cost and failure modes.
3. **C fails the journey test, and the journey is the point.** There is no synchronous route from a companion button to a Claude Code session; the only bridge lands in the inbox. Click "Validate", see nothing, go open a terminal — that is not a journey, it is a hand-off wearing one.
4. **The extensibility actually asked for is prompt-level, not tool-level.** *"Thêm prompt or mcp or skill"* is satisfied if a check is a declared file — a prompt plus a `json_schema` — so adding a check means adding a file. That is the extension described, without a turn loop.

**C is not discarded.** When a job genuinely needs multi-step, cross-repo agency, the companion should hand it to the agent that already has MCP and skills rather than growing a second one. That is a deliberate escape hatch with a stated trigger, not a fallback nobody wrote down.

### The scope call — sequencing, not dropping

Butter answered "all templates". Everything below stays in the plan; what changes is order, and that is worth saying plainly rather than quietly narrowing:

**In, now** — the files the Setup tab already lists: edit, save, deterministic validation, AI review of the prose parts.

**Next, its own task** — JuvenisMaxime mission templates. That repo already has `docs/template-registry.json` (the schema), a `jsp-project` MCP server serving it, and **TASK-1384 open for the drift automation**. The deterministic half belongs there, next to the thing it validates; the companion consuming it is an integration that comes after.

**Separate discovery** — Docker management. Different subsystem, no existing surface in the companion, and a blast radius that has nothing in common with editing a text file.

The boundary that makes the first slice finishable: **the companion writes only to paths already in the read allowlist**. A save cannot create a file, cannot write outside a resolved root, and cannot touch `.claude.json` — which is already unreachable as a file and must stay so.

### NFR — the 12 categories, walked

| Category | Answer | Source |
|---|---|---|
| Performance | Save is one file write; validation is one deterministic pass plus at most one model call. Inventory read already measured at 10 ms + 5 ms | Measured 2026-09-03 |
| Scalability | Single user, single machine, one file at a time. No growth path needed | Default |
| Availability | No SLA; the adapter is local. A model outage degrades to deterministic-only validation, which must still work | Stated |
| **Security** | **The load-bearing one.** Key lives in the adapter, never the renderer (`main.cjs:166-170` precedent). Writes confined to the existing allowlist. `.claude.json` stays unservable and unwritable | Stated |
| Observability | Adapter logging only; a failed save must surface its reason to the user, per the write-actions gotcha | `companion-write-actions-…` |
| **Error handling** | Confirm before write; surface result **or** error, never silent. A model failure is a typed kind, not a crash — english-companion's `ClaudeError` union is the shape | Same gotcha + `claude.js:36-42` |
| Data | The file on disk is the only store. **No backup is written** — which makes "the file changed since you opened it" a correctness requirement, not a nicety | Stated |
| i18n | English only | Default (vault rule) |
| Accessibility | Keyboard-reachable editor and controls, consistent with the existing tab | Default |
| Compliance | None | Default |
| Maintainability | Lives beside `claude-config.ts`; checks are declared files so adding one is not a code change | Stated |
| **Cost / quota** | New for this repo. Model calls are user-triggered only — never on open, never on a poll. A validation that costs money must be a button someone pressed | Stated |

Cost and quota have never appeared in this repo's NFRs before. Naming the rule now — **no model call happens without a click** — is what keeps a background refresh from quietly billing.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 8 | Template drift is documented and dated; the config half is a stated want (*"sửa file được thôi"*) | how often the editor round-trip actually bites — unmeasured |
| 2 | Scope & boundary | 9 | In, next and separate are all named, with a finishable boundary: writes only to allowlisted paths, never creating, never `.claude.json` | — |
| 3 | Technical contract | 7 | Shape decided and precedents read (two-layer validation, 0o600, adapter-owned writes). **No method, path or status codes written yet** | write the save + validate contract against `claude-config.ts` |
| 4 | Prior art | 9 | Write-actions, local-only, ADR-001's key constraint, capture's two layers, the adapter's own write boundary, the drift + BOM learnings, TASK-1384 | — |
| 5 | Edges & failure | 6 | Named: file changed on disk since read, BOM (reproduced), invalid content, write outside allowlist, model outage, concurrent save. **Not traced against a real write path** | trace them once the contract exists |
| 6 | NFR | 9 | 12/12 answered above; 5 stated, 5 defaulted, 2 measured | — |
| 7 | Acceptance criteria | 3 | Can now name surfaces, but every criterion still describes a contract that has not been written | blocked on #3 |

**TOTAL = MIN = 3** (dimension 7)
Round 2: MIN 1 → round 3: MIN 3. New evidence? **YES** (5 sources + a delegated decision) → may continue.

### Score history

| # | Dimension | R1 | R2 | R3 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | 7 | 8 |
| 2 | Scope & boundary | 2 | 5 | 9 |
| 3 | Technical contract | 5 | 6 | 7 |
| 4 | Prior art | 6 | 8 | 9 |
| 5 | Edges & failure | 2 | 4 | 6 |
| 6 | NFR | 2 | 2 | 9 |
| 7 | Acceptance criteria | 1 | 1 | 3 |
| | **MIN** | **1** | **1** | **3** |

The MIN row moved for the first time. It moved because a decision unblocked dimension 2, not because anything was searched harder — which is the loop working as designed.

### Round 4 will look for exactly this

- Write the **save + validate contract** against `claude-config.ts`: method, path, request body, the conflict answer when the file changed on disk, and the status code for a write refused by the allowlist (#3 — unblocks #7)
- Trace those edges against the contract once it exists (#5)
- Then, and only then, the acceptance criteria (#7)

## Round 4 — the contract, and the two edges that would have rewritten every file

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| code | The route is **GET-only at the top** (`if (method !== 'GET') 405`), token-gated, `501` when `claudeHome` is unset, and matched on the RAW url so dot segments reach the guard | `claude-config.ts` handler head, re-read 2026-09-04 |
| code | The read path judges a request by `realpath(target)` against the resolved root set — so a save routed through the **same** function inherits the identical boundary rather than restating it | `claude-config.ts`, `isWithinRoots` |
| knowledge | `template-registry.json` carries a UTF-8 BOM that already broke `JSON.parse` once, taking two MCP tools down while a third kept working | `json-written-on-windows-carries-a-utf-8-bom-…` |
| code | The adapter's existing writes are atomic-by-directory and permission-aware (`mode: 0o600` on the token) — writing in place with no temp file has no precedent here | `bridge-token.ts:34` |

### The contract

**Save — `PUT /claude-config/<rootId>/<rel>`**

The same path that reads is the path that writes. That is the load-bearing choice: the allowlist and the realpath judgement are literally the same code, so **a save cannot reach anywhere a read cannot**. Restating the boundary in a second handler is how the two drift apart.

```
PUT /claude-config/<rootId>/<rel>
  headers: x-choda-bridge-token, if-match: <sha256-hex of the bytes the client read>
  body:    text/plain; charset=utf-8

  -> 200 { sha256, bytes }              written
  -> 400 { error: 'if-match required' } a save with no precondition can clobber
  -> 401 invalid or missing token
  -> 403 { error: 'outside the allowed roots' }   same judge as GET
  -> 404 { error: 'not found: <rel>' }  the file does not exist — saves never CREATE
  -> 409 { error: 'file changed on disk', sha256 }   someone else moved it
  -> 413 { error: 'too large' }         over the cap
  -> 501 claude config serving not configured
```

**`if-match` is a content hash, not an mtime.** Modification times have coarse resolution on some filesystems, move backwards across clock changes, and are altered by tools that did not change a byte. The bytes are the only thing that cannot lie.

**Saves never create.** Every writable path is one the inventory already listed, so a `PUT` to a path that does not exist is a bug in the client, not a new file. This also means the allowlist cannot be used to plant a file.

**Write atomically** — temp file in the same directory, then rename. The precedent is thin (`bridge-token.ts` writes in place) but the stakes differ: truncating `settings.local.json` mid-write leaves an unusable config with no backup, and this feature deliberately keeps no backup.

**Validate — `POST /claude-config/validate`** · deterministic, free, no key required
**Review — `POST /claude-config/review`** · the model call · `501` without a key, `502` on provider failure, `429` passed through

**Two routes, not one flag, and that is the cost control.** If review were `validate?ai=true`, a client could spend money by adding a query parameter, and a well-meaning refactor could default it on. Separate routes make *"no model call without a click"* structural: the free answer is unreachable from the paid one by accident.

### The two edges that would have rewritten every file

Both are the same defect wearing different clothes: **a save must change only what the human changed.**

**Line endings.** These files are CRLF on this machine. A round trip through a text editor that normalises to LF rewrites every line — `git diff` reports 100% changed and the actual edit becomes invisible inside the noise. Detect the dominant ending on read; restore it on write.

**The BOM.** `template-registry.json` carries one, and it has already broken `JSON.parse` in production once. A save that strips it would *silently fix a bug* in a file the user opened for an unrelated reason — which is still an unrequested change, and one that would be attributed to whatever else they edited. Preserve it, and let **validation report it** as a finding. That is the difference between a validator and a formatter.

### Every edge, traced against the contract

| Edge | Behaviour | Why not the obvious alternative |
|---|---|---|
| File changed on disk since read | `409` with the current hash | Last-write-wins loses an edit with no trace |
| Two windows saving the same file | Second gets `409` | Same mechanism; no locking needed |
| Save to a path outside the roots | `403`, no bytes written | Judged before the write, by the read's own function |
| Save to a file that does not exist | `404` | Creating would let the allowlist plant files |
| `.claude.json` | Unreachable — it has no root | It is 123 KB of which MCP is a minority |
| BOM present | Preserved; reported by validate | Stripping is an unrequested change |
| CRLF file | Preserved | Normalising rewrites every line |
| Empty body | Written; it is a legal file | Refusing would invent a rule the filesystem does not have |
| Oversized body | `413` | A cap the user can hit is better than a hang |
| Model unavailable / no key | `502` / `501`; deterministic findings still returned | Validation must not depend on a paid service |
| Model returns unparseable output | Typed `parse` failure, surfaced as one message | `claude.js`'s error union is the precedent |

### Acceptance criteria

- [ ] AC-1 (machine) — `PUT` to a path that resolves outside the allowlisted roots returns 403 and the target file's bytes are unchanged on disk. Fail: 200, or the file's hash differs after the call.
- [ ] AC-2 (machine) — `PUT` without `if-match` returns 400 and writes nothing. Fail: the write succeeds, which is the clobber this precondition exists to prevent.
- [ ] AC-3 (machine) — Given a file modified on disk after the client read it, `PUT` with the stale hash returns 409 and leaves the file as the other writer left it. Fail: the stale content wins.
- [ ] AC-4 (machine) — `PUT` to a `rootId`/`rel` naming a file that does not exist returns 404 and creates nothing. Fail: a new file appears.
- [ ] AC-5 (machine) — A file whose content is CRLF and starts with a BOM round-trips through read → unmodified save with **byte-identical** content. Fail: the bytes differ, which is what a normalising writer produces.
- [ ] AC-6 (machine) — `POST /claude-config/validate` returns findings with no API key configured, and issues no outbound request. Fail: it 501s, or a request leaves the machine.
- [ ] AC-7 (machine) — `POST /claude-config/review` with no key returns 501 and makes no provider call; with a stubbed provider failure it returns 502. Fail: either crashes, or review runs implicitly from `/validate`.
- [ ] AC-8 (machine) — No route accepts a model call without an explicit request to `/review`: asserted by walking the route table. Fail: a query parameter or header on another route reaches the provider.
- [ ] AC-9 (machine) — A validation run on `template-registry.json` reports the BOM as a finding rather than removing it, and the file is byte-identical afterwards. Fail: the file changes.
- [ ] AC-10 (human) — In the packaged app, edit a `SKILL.md` in Setup, save it, and confirm `git diff` in that repo shows only the lines actually changed. Fail: the whole file shows as modified.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Butter first-hand on the config half; the template half is a dated, documented month-long drift with compensating off-by-one errors | — |
| 2 | Scope & boundary | 9 | In / next / separate all named; boundary is "writes only where reads already reach, never creating" | — |
| 3 | Technical contract | 9 | Method, path, precondition header, body type and eight status codes, written against the re-read guard; two routes chosen so the cost boundary is structural | — |
| 4 | Prior art | 9 | Write-actions, local-only, ADR-001's key constraint, capture's two-layer validation, `0o600`, the adapter's own write boundary, the BOM and drift learnings, TASK-1384 | — |
| 5 | Edges & failure | 9 | Eleven edges, each with a behaviour and a rejected alternative; two of them (BOM, CRLF) reproduced or documented rather than imagined | — |
| 6 | NFR | 9 | 12/12 in round 3; cost named as a structural rule, not a convention | — |
| 7 | Acceptance criteria | 9 | Ten criteria, each naming a surface and a failure that differs from its pass; AC-5 and AC-9 assert byte-identity, which a formatter cannot satisfy | — |

**TOTAL = MIN = 9** — converged.
Round 3: MIN 3 → round 4: MIN 9. New evidence? **YES** (4 sources).

### Score history

| # | Dimension | R1 | R2 | R3 | R4 |
|---|---|---|---|---|---|
| 1 | Problem & value | 5 | 7 | 8 | 9 |
| 2 | Scope & boundary | 2 | 5 | 9 | 9 |
| 3 | Technical contract | 5 | 6 | 7 | 9 |
| 4 | Prior art | 6 | 8 | 9 | 9 |
| 5 | Edges & failure | 2 | 4 | 6 | 9 |
| 6 | NFR | 2 | 2 | 9 | 9 |
| 7 | Acceptance criteria | 1 | 1 | 3 | 9 |
| | **MIN** | **1** | **1** | **3** | **9** |

## ✅ All dimensions ≥ 9 after 4 rounds

| # | Dimension | Score | WHY it earned 9 — evidence, not confidence |
|---|---|---|---|
| 1 | Problem & value | 9 | Stated first-hand, plus a documented drift that survived a month behind two compensating off-by-one errors |
| 2 | Scope & boundary | 9 | The finishable boundary is a sentence: writes reach only where reads already reach, and never create |
| 3 | Technical contract | 9 | Eight status codes and a content-hash precondition, written against the guard re-read this round; `PUT` reuses the GET's own judgement rather than restating it |
| 4 | Prior art | 9 | Eight prior entries read and applied; the BOM edge came from the knowledge base and was then reproduced live |
| 5 | Edges & failure | 9 | Eleven edges with behaviours and rejected alternatives. The two sharpest — BOM and CRLF — are the ones that would have made every save look like a rewrite |
| 6 | NFR | 9 | 12/12, with cost enforced by route separation rather than by a convention someone must remember |
| 7 | Acceptance criteria | 9 | Ten criteria; AC-5 and AC-9 demand byte-identity, which no formatter can pass |

**Exemptions:** none.

**Unproven assumptions carried forward:**

1. **How often the editor round-trip actually bites is unmeasured.** The config half rests on a stated preference, not a counted frequency. If it turns out to be rare, the deterministic validator is still worth building and the editor may not be.
2. **Atomic write via temp-and-rename is chosen on reasoning, not on a failure this repo has seen.** `bridge-token.ts` writes in place and has never corrupted anything.
3. **The single-model-call shape is a bet that prose judgement fits in one call.** If a real check needs to look something up, option C's escape hatch is the answer — not a tool loop grown quietly inside option A.
4. **`template-registry.json` was read, not written.** No save has ever been exercised against a 117 KB file, and the size cap is a number nobody has tuned.

**Rounds:** 4 · **evidence:** 26 citations across code (11), knowledge/ADR (9), disk (4), reproduced failure (1), plus two delegated decisions
