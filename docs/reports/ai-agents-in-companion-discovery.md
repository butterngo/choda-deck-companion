---
requirement: "hiện tại chúng ta đang có azure foundry, và đã tương tác được với docker, skill... trên companion — có thể dùng AI call AI không? vd claude-code sẽ call vô companion để trong đó có những agent chuyên dụng làm 1 việc nào đó"
started: 2026-09-08
workspace: Companion
status: converged
---

# Discovery — AI calling AI: specialised agents hosted in the companion

## Round 1 — the model call is already generalised; the calling path is not

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| code | Azure AI Foundry is already wired and live, not aspirational: endpoint + deployment in `ai-provider.json`, key in `ai-key.txt` (0600, beside `bridge-token.txt`), deployment listing on api-version `2023-03-15-preview`, reasoning deployments detected by id prefix | `src/adapters/companion/azure-review.ts:27,41,52,71,161` |
| code | **The agent primitive already exists**, unnamed: `askAzureJson<T>({ cfg, system, user, schema, schemaName, model })` is a structured-output call with a per-call system prompt, per-call schema and per-call deployment. An "agent" in this codebase is that call plus a name | `src/adapters/companion/azure-review.ts:220-232` |
| code | The provider contract is deliberately provider-agnostic — `ReviewNote`, `AiError` with kinds a caller acts on differently (`no_key`, `rate_limit`, `budget`, `refusal`). An Anthropic implementation lived here and was DELETED once unused | `src/adapters/companion/ai-review.ts:1-60` |
| code | The shipped route pattern for an AI feature: own route, explicit request, never on a read path — `/tasks/ac-review`, 64 KB body cap, verdicts indexed to match `ac_check`'s checkbox numbering | `src/adapters/companion/ac-review.ts:14,20,22-32` |
| code | **The companion serves no MCP surface.** `index.ts` starts only `startCompanionServer`; the vendored bundle contains zero occurrences of `tools/list` | `src/adapters/companion/index.ts:6-7`; `electron/vendor/companion-server.cjs` (grep count 0) |
| report | Prior art on what the adapter may execute, and the shape of the permission: fixed program, array args, no shell, no stdin, capped buffer, injectable seam, read-only subcommands, synchronous because bounded | `docs/reports/docker-management-discovery.md:85` |
| report | Mutating commands were deliberately NOT granted with the read half, because two of those seven properties do not survive them — and that split was called out as the largest decision in the feature | `docs/reports/docker-management-discovery.md:87-89` |
| report | The cost boundary already stated for AI work: its own route, reached only on an explicit request; `/tasks` stays free | `src/adapters/companion/ac-review.ts:14` |

### The finding that reframes the question

Butter's phrasing was "claude-code sẽ call vô companion". **That path does not exist.**
Claude Code talks to the `choda-tasks` MCP server; the companion is a separate HTTP
adapter on a local port behind `x-choda-bridge-token`, and the packaged bundle carries
no MCP transport at all. They meet at the SQLite file, not over a wire.

So the requirement contains a hidden fork nobody has chosen yet:

* **(a)** the agent runs in the MCP server → Claude Code calls it as a tool, no new
  transport, but it does NOT get the companion's ambient access (docker, workspace, the
  long-running process);
* **(b)** the agent runs in the companion → it has that access, and a new calling path
  has to be built (an MCP tool that proxies to `127.0.0.1:<port>` with the bridge token,
  or the MCP server importing the companion's modules directly);
* **(c)** the agent runs in the companion and is NOT called by Claude Code at all — it
  fires on an event the companion already sees (a container exits non-zero, a session
  ends, a cron tick). This is the only variant where "AI calls AI" buys something a
  human-driven session cannot already do inline.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | The capability is real and cheap to reach (`azure-review.ts:220`), but no pain is cited — no inbox item, no task, no repeated manual step measured. "We could" is not "someone hurts" | name one job an agent does that a human or Claude Code inline does not do today |
| 2 | Scope & boundary | 3 | Nothing is in or out. Not even the fork above is chosen, and "some specialised agents" names no agent | Butter picks (a)/(b)/(c) and names the first agent |
| 3 | Technical contract | 6 | The model call is fully read: system + user + JSON schema + deployment (`azure-review.ts:220-232`), key and config resolution (`:71,105`), and the route shape a feature uses (`ac-review.ts:22`). The GAP is the invocation path — the companion has no MCP surface (`index.ts:6-7`) | choose the fork, then read the transport that fork implies |
| 4 | Prior art & constraints | 8 | The permission shape is already written down as seven properties, and mutating execution was deliberately withheld (`docker-management-discovery.md:85,87`); the AI cost boundary is stated (`ac-review.ts:14`); a dead Anthropic provider was removed rather than kept (`ai-review.ts:1-15`) | check whether any ADR governs AI usage/cost beyond that one comment |
| 5 | Edges & failure | 3 | Untouched. `AiError` names the failure kinds a caller acts on (`ai-review.ts:34-47`), which is a start, but nothing is traced for an AGENT: a tool call that loops, a schema the model will not satisfy, two agents on one workspace, an agent that answers while the container it describes is gone | trace them once the fork is chosen |
| 6 | NFR | 3 | Only cost has a stated position (`ac-review.ts:14`). The other 11 categories are unanswered — latency budget, concurrency, what is logged, where the key can reach | walk `references/nfr-checklist.md` |
| 7 | Acceptance criteria | 2 | None exist, and none can be written: they depend on #3, whose gap depends on a decision | blocked on #2 and #3 |

**TOTAL = MIN = 2** (dimension 7)
Previous round: — · this round: 2. New evidence? **YES** (8 citations) → may continue.

### Score history

| # | Dimension | R1 |
|---|---|---|
| 1 | Problem & value | 5 |
| 2 | Scope & boundary | 3 |
| 3 | Technical contract | 6 |
| 4 | Prior art & constraints | 8 |
| 5 | Edges & failure | 3 |
| 6 | NFR | 3 |
| 7 | Acceptance criteria | 2 |
| | **MIN** | **2** |

### Stop condition — §5, blocked on a human decision

Dimension 2 cannot rise by searching. Three questions, and the second is the same
question TASK-1840 stopped on, one layer up:

1. **Which fork — (a), (b) or (c)?** They are different features with different
   transports, not three ways to build one thing.
2. **May an agent call TOOLS, or does it only take text in and return JSON out?**
   Today every program the adapter runs is fixed at compile time with array args and no
   shell (`docker-management-discovery.md:85`). An agent choosing its own tool calls is
   the first time a MODEL decides what runs on Butter's machine. `askAzureJson` returns
   structured JSON and nothing else, so the no-tools variant is reachable today and the
   with-tools variant is a new permission category — exactly the split that report
   refused to smuggle through.
3. **Name the first agent.** One concrete job, so the contract has something to be
   about. Without it, dimension 7 has no surface to name and this loop cannot converge.

### Round 2 will look for exactly this

- The answers to Q1-Q3 (taken as evidence, per §5)
- Then, per the chosen fork: read the transport it implies (MCP tool registration under
  `src/adapters/mcp/mcp-tools/`, or the bridge-token path in `http-server.ts`)
- `knowledge_list(type='decision')` for any ADR governing AI usage or cost (#4's gap)

## Round 2 — (a) chosen; the model call turns out to be reachable from the MCP server with no new plumbing

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| user | **Fork (a)**: the agent runs in the MCP server and Claude Code calls it as a tool. (b) and (c) are out of scope for this requirement | Butter, 2026-09-08: "a trước đi" |
| code | `resolveAzureConfig(dataDir)` takes the data directory as a PARAMETER and reads `ai-provider.json` + `ai-key.txt` from it — it is not bound to the companion process | `src/adapters/companion/azure-review.ts:76-102` |
| code | The MCP server already holds `dataDir` in its build deps and already passes it to a tool module (`backupTools.register(instrumented, svc, deps.dataDir, deps.dbPath)`) | `src/adapters/mcp/server-bootstrap.ts:44,98,135` |
| code | → **Under (a) the Foundry call needs no new configuration path.** The same two files the companion reads are reachable from the MCP process by passing the dataDir that is already there | (the two rows above, taken together) |
| code | A tool's exposure is already governed: `REMOTE_TOOL_ALLOWLIST` is default-DENY, and expanding it requires three coordinated edits (allowlist + `remote-operations.interface.ts` + a Postgres implementation). ADR-026 per-tool scoping standing rule; ADR-035 keeps `investigation_*` stdio-only for exactly this reason | `src/adapters/mcp/server-bootstrap.ts:52-71,96` |
| code | The tool-module shape a new agent tool would follow: `register(server, svc, …)` with a zod `inputSchema`, a prose description that IS the calling contract, and `textResponse` out | `src/adapters/mcp/mcp-tools/ac-check.ts:21-45` |
| knowledge | **No ADR governs AI usage or cost in this project.** `knowledge_search` over "AI provider cost boundary / when may a route call a model" returns no choda-deck hit; the only stated position is a code comment | `knowledge_search` 2026-09-08; `src/adapters/companion/ac-review.ts:14` |
| knowledge | A cost ceiling does exist in Butter's world, but in another project: 130 USD/month for AI, and the note's whole point is that a budget alert does not stop spending | `juvenis-maxime/docs/knowledge/cost-ceiling-enforced-by-policy-deny-not-budget-alert.md` (cross-project — context, not governance here) |

### What (a) settles, and what it silently rules out

In: an agent is a tool in the `choda-tasks` MCP server — `askAzureJson` with a named
system prompt and a JSON schema, wrapped in a `register()` module, reading its provider
config from `dataDir`.

Out, by construction rather than by choice — worth stating so nobody expects it later:

* no docker access (the containers, the exec route and the logs all live in the
  companion's HTTP adapter, a different process);
* no workspace file access beyond what the MCP tools already read;
* nothing event-driven — a tool only runs when Claude Code calls it, so "the companion
  notices a container died and asks a model why" is not this feature.

**Q2 shrinks under (a), and that is the useful consequence.** In the companion, "may an
agent call tools" meant "may a model choose which PROGRAM runs on this machine" — the
permission category `docker-management-discovery.md:87` refused to grant. In the MCP
server there are no programs: the tools are typed SQLite operations (`task_list`,
`knowledge_search`, `inbox_get`). Letting an agent call those is a question about DATA
REACH, not about execution — and the exposure axis already has a default-DENY answer in
`REMOTE_TOOL_ALLOWLIST`.

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | Carried. The fork choice says HOW, not WHY; still no cited pain, no measured manual step | name the job — see Q3 |
| 2 | Scope & boundary | 6 | (a) is chosen, and it rules out docker / files / event-driven by construction (`server-bootstrap.ts:135` vs the companion's own process, `companion/index.ts:6-7`). Still no agent named, so "what is in" is a shape, not a feature | name the first agent |
| 3 | Technical contract | 8 | Every piece is now read: the model call (`azure-review.ts:220-232`), config from dataDir (`:76-102`), the dataDir already in MCP deps (`server-bootstrap.ts:44,98`), the tool-module shape (`ac-check.ts:21-45`), the exposure gate (`server-bootstrap.ts:52-71`). GAP: the tool's own input/output schema cannot be written until the agent is named | Q3 |
| 4 | Prior art & constraints | 8 | Permission shape (`docker-management-discovery.md:85,87`), per-tool scoping ADR-026 + ADR-035 default-DENY (`server-bootstrap.ts:52-71`), and the removed Anthropic provider (`ai-review.ts:1-15`). NAMED GAP: no ADR governs AI cost — the boundary is a comment, and a comment is not a rule anything enforces | write that ADR, or accept the comment as the rule deliberately |
| 5 | Edges & failure | 4 | One edge is settled and cited: a new tool is NOT remotely reachable by default (`server-bootstrap.ts:52-71`). The rest are untraced — a model that will not satisfy the schema, a `budget` answer with an empty body (`ai-review.ts:41-45` says this really happens), the key file absent on a machine that never configured one, two calls racing on one task | trace them against the named agent |
| 6 | NFR | 4 | Cost has a position but no enforcement (`ac-review.ts:14`), and the cross-project note says a budget alert does not stop spend. 11 of 12 categories unwalked | walk `references/nfr-checklist.md` |
| 7 | Acceptance criteria | 2 | Carried. Cannot name a surface for a tool that has no name and no schema | Q3, then #3 closes |

**TOTAL = MIN = 2** (dimension 7)
Previous round: 2 · this round: 2. New evidence? **YES** (8 citations) → may continue.

### Score history

| # | Dimension | R1 | R2 |
|---|---|---|---|
| 1 | Problem & value | 5 | 5 |
| 2 | Scope & boundary | 3 | 6 |
| 3 | Technical contract | 6 | 8 |
| 4 | Prior art & constraints | 8 | 8 |
| 5 | Edges & failure | 3 | 4 |
| 6 | NFR | 3 | 4 |
| 7 | Acceptance criteria | 2 | 2 |
| | **MIN** | **2** | **2** |

MIN is flat at 2 across two rounds while five dimensions moved. That is not the loop
spinning — it is dimension 7 correctly refusing to rise, because it is blocked on a
question no amount of reading answers.

### Stop condition — blocked on a human decision (Q3)

**Name the first agent.** Dimensions 1, 2, 5 and 7 are all waiting on the same missing
noun. Three candidates the evidence supports, each with the reason it is checkable:

1. **`ac_review` as a tool** — the agent that ALREADY EXISTS as an HTTP route
   (`ac-review.ts:22`), grading criteria against the five tests. Under (a) it becomes
   callable from Claude Code, so the planning and verification skills could use it
   instead of a human remembering to. Cheapest by far: the prompt, the schema and the
   parser exist; only the tool wrapper is new.
2. **inbox clusterer** — over the raw inbox (64 items, read 2026-09-07), propose
   duplicate clusters so one investigation answers several. Checkable because a proposed
   cluster is either the same concern or visibly not.
3. **knowledge deduper** — before `knowledge_create`, ask whether an existing entry
   already covers it. Checkable against the entry it names.

Recommendation: **1**. It is the only one whose judgement is already written, already
prompted and already schema-bound, so the requirement reduces to a transport question
this round has fully answered.

### Round 3 will look for exactly this

- The answer to Q3 (taken as evidence)
- Then, against the named agent: trace the failure paths in `ai-review.ts:34-47`
  (`budget`, `refusal`, `no_key`) for #5, and walk `references/nfr-checklist.md` for #6
- Then #7 — criteria that name the tool, its schema and its failure statuses

## Round 3 — the agent is named, and reading it found a defect in the grader itself

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| user | The first agent is **`ac_review`** — the existing grader, exposed as an MCP tool | Butter, 2026-09-08: "1" |
| code | **Nothing calls the grader except the web UI.** `grep -rl "ac-review\|ac_review"` over `~/.claude/skills/` returns NOTHING — neither `/choda-plan`, which writes the five-test standard, nor `/choda-verify-ac`, which decides what may be ticked | grep over `C:\Users\hngo1_mantu\.claude\skills\`, 2026-09-08, 0 hits |
| code | The route says the gap in its own words: the standard "is written down in five tests. Nothing applies it except a human remembering to" | `src/adapters/companion/ac-review.ts:8-11` |
| code | The full status contract, read end to end: 405 non-POST · 401 bad token · 413 body over 64 KB · 400 invalid JSON · 400 missing taskId · 404 unknown task · **404 no acceptance criteria** (checked BEFORE the provider, so an empty task costs nothing) · 501 no model configured · 429 + `retry-after` on rate limit · 502 `{error:'provider failed', kind}` for everything else · 200 `{criteria:[{index,text,verdict,concern,suggestion}]}` | `src/adapters/companion/ac-review.ts:131-230` |
| code | Provider text is deliberately NOT forwarded: a provider body can echo the key back in a reflected request | `src/adapters/companion/ac-review.ts:222-225` |
| code | The grader never writes: `suggestion` is "A rewritten criterion to READ. Never written back." | `src/adapters/companion/ac-review.ts:31` |
| code | **FINDING — the fallback runs in the unsafe direction.** A criterion the model omits from its answer is rendered `verdict: 'ok'` (`got?.verdict === 'weak' ? 'weak' : 'ok'`), i.e. approved. The comment three lines above says a missing criterion rendering as approved "is the one direction this feature must never fail in" — the comment and the code disagree | `src/adapters/companion/ac-review.ts:196-212` |
| code | And it is untested: the only test whose reply omits an index asserts on `criteria[1]` and never looks at `criteria[0]`, so the default is unobserved in either direction | `src/adapters/companion/ac-review.test.ts:186-193` |
| state | Fresh read: choda-deck has exactly **1** READY task (`TASK-1103`). READY is the status `/choda-burn-backlog` runs unattended, so the blast radius of a wrong grade today is small — this is a guard being installed before it is needed, not after a failure | `task_list(status='READY')`, 2026-09-08 |

### The defect, and what it means for this requirement

The grader exists to stop a criterion that cannot fail from passing the READY gate. When
the model answers about four of five criteria, the fifth comes back **approved** —
silently, with no marker distinguishing "the model judged this ok" from "the model never
mentioned it". That is the same shape as the two failures already gathered on this
project: a read whose success and failure produce identical output
(`ls-la-always-prints-a-total-line…`), and a test that could not fail.

It matters more as a TOOL than as a route. A human clicking Review in the web UI sees
five rows and can notice one looks untouched; `/choda-plan` calling `ac_review` to gate
READY unattended cannot notice anything — it gets `ok` and moves on.

**So the requirement is not merely "wrap the route as a tool".** The wrapping is small;
the honest version of this feature is: expose it, and make an unanswered criterion say
so. That belongs in the same task, because shipping the wrapper alone hands an
unattended caller a grader that fails silently in the approving direction.

### NFR — all 12 categories (dimension 6)

| Category | Answer | Source |
|---|---|---|
| Performance | One model round-trip per call; no budget stated. Reasoning deployments can spend the whole budget thinking and return an empty body — already a named error kind (`budget`) | `ai-review.ts:41-45` |
| Scalability | Not applicable — one user, one local process, one call per explicit request | Assumed (checklist default) |
| Availability | No SLA; when the provider is down the tool answers 502 with a `kind` the caller acts on | `ac-review.ts:222-226`; checklist default |
| Security | Key lives in `ai-key.txt` mode 0600, never in the environment of spawned children; provider text is never forwarded to the caller | `azure-review.ts:71,105`; `ac-review.ts:222-225` |
| Observability | Tool invocations are recorded by the instrumented server on stdio (`recordToolInvocation`); nothing AI-specific is logged today | `server-bootstrap.ts:74-78` |
| Error Handling | Full status map read this round; no retry is performed — `retry-after` is handed to the caller instead | `ac-review.ts:216-226` |
| Data | Task bodies leave the machine for the provider on each call. Nothing is persisted from the answer — the grader never writes | `ac-review.ts:31` |
| i18n | Criteria are English by the global rule; the grader's prompt is English | Butter's standing language rule |
| Accessibility | Not applicable — a tool, no UI surface | Exempt by nature |
| Compliance | Task bodies are Butter's own project data; no third-party PII involved | Assumed |
| Maintainability | One new tool module beside 28 existing ones, same `register()` shape | `mcp-tools/` (28 modules), `ac-check.ts:21` |
| Integration | Azure AI Foundry via `askAzureJson`; exposure governed by `REMOTE_TOOL_ALLOWLIST` (default-DENY → stdio only) | `azure-review.ts:220`; `server-bootstrap.ts:52-71` |

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | The grader that exists is reachable only from the web UI — 0 hits across every skill file — while the two skills that gate READY (`/choda-plan`, `/choda-verify-ac`) cannot call it. The route states the gap itself (`ac-review.ts:8-11`) | — |
| 2 | Scope & boundary | 9 | IN: one stdio MCP tool wrapping the existing grader, plus making an unanswered criterion visible. OUT: docker, files, event-driven agents, writing verdicts back to the task (`ac-review.ts:31`), remote exposure (`server-bootstrap.ts:52-71`), and any second agent | — |
| 3 | Technical contract | 9 | Every status and both bodies read end to end (`ac-review.ts:131-230`); config resolution from `dataDir` (`azure-review.ts:76-102`) with `dataDir` already in MCP deps (`server-bootstrap.ts:44,98`); tool shape from `ac-check.ts:21-45` | — |
| 4 | Prior art & constraints | 8 | Permission model, per-tool scoping and the removed provider all checked. NAMED GAP: no ADR governs AI cost anywhere in choda-deck — the rule lives in a comment (`ac-review.ts:14`), and a comment enforces nothing | Butter either writes that ADR or states the rule so it can be cited |
| 5 | Edges & failure | 9 | Traced against the named agent: 404 for empty criteria BEFORE any spend, 501 unconfigured, 429 with `retry-after`, 502 with `kind` and no provider text, 413 oversize — plus the omitted-index defect and its untested status (`ac-review.ts:196-212`, `ac-review.test.ts:186-193`) | — |
| 6 | NFR | 9 | 12/12 answered above; 3 defaulted per the checklist, 1 exempt by nature, the rest cited | — |
| 7 | Acceptance criteria | 9 | 6 criteria below; each names a surface (a tool call, a status, a field), each can fail, each carries one verdict | — |

**TOTAL = MIN = 8** (dimension 4)
Previous round: 2 · this round: 8. New evidence? **YES** (9 citations) → may continue.

### Score history

| # | Dimension | R1 | R2 | R3 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | 5 | 9 |
| 2 | Scope & boundary | 3 | 6 | 9 |
| 3 | Technical contract | 6 | 8 | 9 |
| 4 | Prior art & constraints | 8 | 8 | 8 |
| 5 | Edges & failure | 3 | 4 | 9 |
| 6 | NFR | 3 | 4 | 9 |
| 7 | Acceptance criteria | 2 | 2 | 9 |
| | **MIN** | **2** | **2** | **8** |

### Draft acceptance criteria

- [ ] AC-1 — `ac_review` is registered as an MCP tool taking `taskId` and an optional `model`, and returns one verdict row per criterion with `index`, `text`, `verdict`, `concern`, `suggestion`; a test asserts the row count equals the number of `- [ ]` lines under `## Acceptance` for a task with three criteria and one non-checkbox line. [machine]
- [ ] AC-2 — A criterion the model does NOT answer for comes back marked as unanswered, never as `ok`; a test feeds a reply omitting index 0 and asserts index 0's verdict is not `ok`, with a control proving an explicitly-`ok` criterion still reads `ok`. [machine]
- [ ] AC-3 — A task with no `## Acceptance` section answers with a stated "nothing to grade" and issues ZERO provider calls; a test asserts the provider stub was never called. [machine]
- [ ] AC-4 — An unconfigured machine (no `ai-provider.json` or no key) answers "no model configured" and returns no verdicts, rather than an empty verdict list that reads as "everything is fine"; a test asserts both the message and that no `criteria` array is returned. [machine]
- [ ] AC-5 — A provider failure surfaces the `AiError` kind (`rate_limit`, `budget`, `refusal`, `network`) and NEVER the provider's own body; a test asserts the kind is present and that a provider message containing the string `sk-` does not appear in the tool's output. [machine]
- [ ] AC-6 — The tool is absent from `REMOTE_TOOL_ALLOWLIST`, so it is unreachable over the HTTP transport; a test asserts the remote server's tool list does not contain `ac_review` while the stdio server's does. [machine]

### Stop condition — one question left (dimension 4)

Everything except prior art is at 9, and dimension 4's gap is not a search problem:

> **No ADR governs AI cost or usage in choda-deck.** The only stated rule is a comment
> on `ac-review.ts:14` — its own route, reached only on an explicit request, `/tasks`
> stays free. Adding a callable tool makes that rule matter more, because a skill can
> call it in a loop where a human clicking a button cannot.
>
> Write it as an ADR now, or state the rule here so this task can cite it?

## Round 4 — the rule that was a comment is now an ADR

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| user | Option A: write the ADR rather than state the rule inline | Butter, 2026-09-08: "a" / "có" |
| ADR | The governance gap named in R2 and R3 is closed: when a model may be called, one subject per call, no unattended sweep, no automatic retry, stdio-only by default, key in a file. Written with refs so staleness tracks it | `docs/knowledge/adr-when-this-project-may-call-a-model.md` (created 2026-09-08, refs `ac-review.ts`, `azure-review.ts`, `server-bootstrap.ts` @ `fffdd17`) |
| ADR | Two limits stated rather than implied: no monetary ceiling is set (a real one is Azure-side), and point 3 binds skills, which are prose — nothing enforces it at compile time | same, §Consequences |

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Carried from R3: 0 skill files reference the grader; the two skills that gate READY cannot call it (`ac-review.ts:8-11`) | — |
| 2 | Scope & boundary | 9 | Carried: one stdio tool + making an unanswered criterion visible; docker, files, event-driven, write-back and remote exposure all explicitly out | — |
| 3 | Technical contract | 9 | Carried: full status map and both bodies read (`ac-review.ts:131-230`), config from `dataDir` already in MCP deps | — |
| 4 | Prior art & constraints | 9 | The gap is closed by a citable rule, not by a comment: `adr-when-this-project-may-call-a-model`. AC-6 below now enforces one of its points in code | — |
| 5 | Edges & failure | 9 | Carried: every status traced, plus the omitted-index defect and its untested state (`ac-review.ts:196-212`, `ac-review.test.ts:186-193`) | — |
| 6 | NFR | 9 | Carried: 12/12 answered in R3 | — |
| 7 | Acceptance criteria | 9 | Carried: 6 criteria, each naming a surface, each able to fail | — |

**TOTAL = MIN = 9**
Previous round: 8 · this round: 9. New evidence? **YES** (3 citations) → converged.

### Score history

| # | Dimension | R1 | R2 | R3 | R4 |
|---|---|---|---|---|---|
| 1 | Problem & value | 5 | 5 | 9 | 9 |
| 2 | Scope & boundary | 3 | 6 | 9 | 9 |
| 3 | Technical contract | 6 | 8 | 9 | 9 |
| 4 | Prior art & constraints | 8 | 8 | 8 | 9 |
| 5 | Edges & failure | 3 | 4 | 9 | 9 |
| 6 | NFR | 3 | 4 | 9 | 9 |
| 7 | Acceptance criteria | 2 | 2 | 9 | 9 |
| | **MIN** | **2** | **2** | **8** | **9** |

## ✅ All dimensions ≥ 9 after 4 rounds

| # | Dimension | Score | WHY it earned 9 — evidence, not confidence |
|---|---|---|---|
| 1 | Problem & value | 9 | The grader exists and nothing can call it: `grep -rl "ac-review\|ac_review"` over every skill file returns 0 hits, while `/choda-plan` writes the standard and `/choda-verify-ac` applies it. The route states the gap in its own comment (`ac-review.ts:8-11`) |
| 2 | Scope & boundary | 9 | IN: one stdio MCP tool + an unanswered criterion that says so. OUT, each with a reason: docker and files (different process, `companion/index.ts:6-7`), event-driven agents (fork (c), not chosen), write-back (`ac-review.ts:31` — suggestions are read-only), remote exposure (`server-bootstrap.ts:52-71`), any second agent |
| 3 | Technical contract | 9 | Read end to end: 405/401/413/400/404/404/501/429+`retry-after`/502+`kind`/200 with `{index,text,verdict,concern,suggestion}` (`ac-review.ts:131-230`); `resolveAzureConfig(dataDir)` (`azure-review.ts:76-102`) with `dataDir` already in MCP deps (`server-bootstrap.ts:44,98`); tool shape from `ac-check.ts:21-45` |
| 4 | Prior art & constraints | 9 | ADR-026 per-tool scoping + ADR-035 stdio-only (`server-bootstrap.ts:52-71,96`), the seven-property permission shape (`docker-management-discovery.md:85,87`), the deleted Anthropic provider (`ai-review.ts:1-15`), and the new `adr-when-this-project-may-call-a-model` closing the cost-governance gap |
| 5 | Edges & failure | 9 | Empty criteria answered BEFORE any spend (`ac-review.ts:174-178`), unconfigured machine 501, rate limit 429 with `retry-after`, everything else 502 carrying `kind` and never the provider body (`:222-226`) — and the omitted-index defect found by reading, with the test that fails to observe it (`:196-212`, `ac-review.test.ts:186-193`) |
| 6 | NFR | 9 | 12/12 in R3: 3 defaulted per the checklist, 1 exempt by nature (accessibility — no UI), 8 cited |
| 7 | Acceptance criteria | 9 | 6 criteria; each names a surface (a tool call, a status, a field, an allowlist), each can fail — AC-2's fail state is the defect that exists in `main` today, and AC-6 turns ADR point 5 into a test |

**Exemptions:** none granted. Accessibility was answered "not applicable — a tool, no UI surface" inside dimension 6 rather than exempted as a dimension.

**Unproven assumptions carried forward:**

* Nobody has measured how often criteria in this backlog actually FAIL the five tests. The value case rests on the grader being unreachable, not on a measured rate of weak criteria.
* The model's compliance with the schema is assumed from the shipped route's behaviour; this discovery never invoked the live provider, so no fresh observation of Foundry answering `ac_review` exists.
* ADR point 3 (no unattended sweep) binds skills, which are prose. Nothing checks it.

**Rounds:** 4 · **evidence:** 28 citations across code (19), reports (3), knowledge/ADR (4), fresh state reads (2)
**Report:** `docs/reports/ai-agents-in-companion-discovery.md`
**ADR written during discovery:** `docs/knowledge/adr-when-this-project-may-call-a-model.md`
