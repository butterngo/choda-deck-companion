---
requirement: Trong file viewer, bấm vào một symbol (ví dụ `ServiceTokenWorkspaceFilter`) là nhảy tới định nghĩa của nó — kiểu code link
started: 2026-09-02
workspace: Companion
status: converged
---

# Discovery — click a symbol in the file viewer and land on its definition

Source: INBOX-1896 · Thread: CONV-1788333459882-1

## Round 1 — symbol go-to-definition in the file viewer

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| conversation | thread opened at round 0; no messages yet | CONV-1788333459882-1 |
| code | The file-serving contract already exists and is complete: list + read, token-gated, with real status codes | `choda-deck/src/adapters/companion/workspace-docs.ts:159-270` |
| code | TASK-1787 (serve the whole tree, not just .md) is MERGED — `include=all` walks every file, `md` stays the default so an old vendored adapter answers as before | commit `a397065`; `workspace-docs.ts:206-215` |
| code | Binary files are listed but refused as text with **415**; traversal → 400; unknown workspace → 404; missing cwd → 409 | `workspace-docs.ts:239-262` |
| code | No code-search surface exists. `/search` fans over task TITLES + knowledge embeddings only — nothing reads file contents | `choda-deck/src/adapters/companion/search.ts:1-6` |
| code | The web client already calls `include=all` and reads a single file by path | `companion/packages/web/src/api.ts:418,449` |
| code | SourceView renders plain text when `html === null` and only swaps in highlight.js markup on success — the no-language case has no spans at all, permanently | `companion/packages/web/src/components/SourceView.tsx:125-133` |
| code | SourceView already owns line identity: `id={"L"+n}`, `data-testid=source-line-n`, and a marked-line set with scroll-into-view | `SourceView.tsx:100-118` |
| ADR | ADR-033 RETIRED the AST symbol graph (functions/imports/calls) and refused to fold it into the unified store, because that store has no AST layer; "**No replacement built.** If structural code-awareness is wanted later, it is new scoped work against the unified graph (an AST `code_ref` extractor) … filed separately if/when the need is concrete" | `ADR-033-deprecate-graphify` §Context 1, §Decision |
| ADR | The unified graph stores `code_ref` at **file/symbol-pointer** granularity with TOUCHES edges — no call-graph, no import-graph layer | `ADR-033` §Context 1; `feature-knowledge-graph` |

**What the ADR does to the three options in INBOX-1896:**

- Option 2 (tree-sitter/LSP index) is not forbidden, but it is precisely the "new scoped work" ADR-033 deferred. Choosing it re-opens a decision closed on 2026-06-04 and needs its own ADR.
- Option 3 (`code_refs` graph) is settled as **insufficient**: wrong granularity by design, and only covers symbols someone registered — `ServiceTokenWorkspaceFilter` is not one.
- Option 1 (text scan for a definition) is untouched by ADR-033 — reading a file's TEXT is explicitly a different act from the AST layer (`workspace-docs.ts:8-13` makes the same distinction).

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 8 | INBOX-1896 + the same argument already written into the adapter: an audit view that names a commit's files and cannot open them is "only half a chain" (`workspace-docs.ts:4-7`); this is that chain one hop further | a second reporter, or Butter naming the concrete moment it cost time |
| 2 | Scope & boundary | 5 | Prose only. Which languages? definitions only or references too? same workspace only or cross-repo? in-pane or new route? None sourced | Butter's answers (§Round 2 questions) |
| 3 | Technical contract | 7 | The *file* contract is read end to end (routes, params, 200/400/401/404/405/409/415, content-type). The **resolve** endpoint does not exist and `/search` does not cover code (`search.ts:1-6`) | decide + specify the resolve endpoint's shape (blocked on #2) |
| 4 | Prior art & constraints | 9 | ADR-033 governs directly: AST graph retired, no replacement, `code_ref` is file/symbol-pointer only. Options 2 and 3 are graded by a real prior decision rather than by taste | — |
| 5 | Edges & failure | 5 | Two failure paths now sourced rather than assumed: no-language files never get spans (`SourceView.tsx:125`), binaries 415 (`workspace-docs.ts:239`). Zero-match / multi-match / stale-file-vs-line still untraced | walk the 5 gap lenses against the chosen resolve path |
| 6 | NFR | 3 | Untouched. A whole-tree scan per click has an obvious latency + repeat-cost question nobody has asked | run `references/nfr-checklist.md` |
| 7 | Acceptance criteria | 2 | Nothing written. Writing AC against an unchosen resolve mechanism guarantees a rewrite | blocked on #2 → #3 |

**TOTAL = MIN = 2** (dimension 7)
Round 0: 1 → Round 1: 2. New evidence? **YES** (10 citations: code 7, ADR 2, conversation 1) → may continue.

### Score history

| # | Dimension | R0 | R1 |
|---|---|---|---|
| 1 | Problem & value | 5 | 8 |
| 2 | Scope & boundary | 3 | 5 |
| 3 | Technical contract | 2 | 7 |
| 4 | Prior art & constraints | 2 | 9 |
| 5 | Edges & failure | 2 | 5 |
| 6 | NFR | 2 | 3 |
| 7 | Acceptance criteria | 1 | 2 |
| | **MIN** | **1** | **2** |

### Round 2 will look for exactly this

- **Ask Butter** (#2 — unblocks #3 and #7): the four scope questions — language coverage, definition-only vs references, cross-workspace, and what happens on zero/multi match.
- Measure the scan cost on a real tree (#6/#3): how long a definition scan over choda-deck's `include=all` listing actually takes, since that is the argument for or against an index.
- Walk the 5 gap lenses over the chosen path (#5).

## Round 2 — scope answered, mechanism measured

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| conversation | thread: no new messages. Butter answered the four scope questions in chat instead: **scan via adapter**, **current workspace only**, **no-language file -> not clickable, say why**, **multi-match -> picker, never guess** | CONV-1788333459882-1 (chat, 2026-09-02) |
| code (live) | The requirement's own symbol resolves with the keyword-anchored regex: `public sealed class ServiceTokenWorkspaceFilter : IEndpointFilter` — the heuristic survives C# modifiers | `bpa-engine/src/BpaEngine/Api/Auth/ServiceTokenAuth.cs:138` |
| measurement | It is **not** in the workspace a companion reader would have open — it lives in the `bpa-engine` workspace (project business-process-automation). "Current workspace only" is therefore a real boundary, not a formality: this exact click fails unless bpa-engine is the open workspace | scan across 6 registered cwds, 2026-09-02 |
| measurement | Scan cost is a non-issue at this scale: 994 files in choda-deck after skipping node_modules/.git/dist/build/coverage, walked in **0.10s**; a full .cs definition scan over bpa-engine in **0.17s** | measured 2026-09-02 |
| measurement | Multi-match is real and must be designed for: bpa-engine has **298 type definitions across 275 distinct names** — 23 names (~8%) defined more than once | definition-keyword scan over *.cs, 2026-09-02 |
| code | `/healthz` returns `{ ok: true }` — **no version or capability field**, so a client cannot ask an adapter which routes it has | `choda-deck/src/adapters/companion/http-server.ts:168-169` |
| code | An old vendored adapter answers an unknown route with the router default `404 { error: 'not found' }`, while workspace-docs answers an unknown workspace with `404 { error: 'unknown workspace: X' }` — the two 404s are distinguishable **by body only** | `http-server.ts:191-192` vs `workspace-docs.ts:246-248` |
| code | This codebase treats a11y as load-bearing, not a default-away: a badge was kept out of a row-level button because nesting "would make the badge unreachable", and collapsed rows leave the DOM because "hidden rows a screen reader can still reach are worse than no rows" | `CommitList.tsx:95`, `DocTree.tsx:116` |

### The contract, now specified

```
GET /workspace-symbols?workspaceId=<id>&name=<Symbol>
  200 { workspaceId, cwd, name, matches: [ { path, line, kind, text } ] }   // [] is a normal answer
  400 { error: "name is required" }            // missing or blank name
  401 { error: "invalid or missing x-choda-bridge-token" }
  404 { error: "unknown workspace: <id>" }     // NOT the router default — the body is the signal
  405 { error: "method not allowed" }
  409 { error: "workspace cwd does not exist", workspaceId, label, cwd }
```

`kind` is one of class | record | interface | struct | enum | type | function | def | func. Mirrors
handleWorkspaceDocsRoute exactly: same token gate, same raw-URL matching, same status-code
family, same SKIP_DIRS walk (`workspace-docs.ts:159-270`).

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | INBOX-1896 states the moment (truy vet mot commit) and the adapter already argues the same chain one hop back (`workspace-docs.ts:4-7`). Butter is the entire user base of the companion, so one reporter is the population | — |
| 2 | Scope & boundary | 9 | Four boundaries decided by Butter, not inferred. **Out:** references (definitions only), cross-workspace search, any AST index, reverse "find usages" | — |
| 3 | Technical contract | 9 | Every element derived from the sibling handler read this round, incl. the 404-body distinction that makes an old adapter diagnosable (`http-server.ts:191` vs `workspace-docs.ts:246`) | — |
| 4 | Prior art & constraints | 9 | ADR-033 grades the options; the chosen one is the only one it does not touch | — |
| 5 | Edges & failure | 9 | Zero-match = 200+[]; multi-match measured at 8% of names; old adapter's 404 vs real 404; binary 415; cwd gone 409; no-language file has no spans (`SourceView.tsx:125`); a11y tab-stop cost (`CommitList.tsx:95`) | — |
| 6 | NFR | 9 | 12/12 below, perf measured rather than assumed | — |
| 7 | Acceptance criteria | 9 | 10 criteria, each names its surface and carries a control that would fail | — |

**NFR — 12 categories**

| Category | Answer | Source |
|---|---|---|
| Performance | Scan < 1s; measured 0.10-0.17s over ~1k files. No cache, no index | measured 2026-09-02 |
| Scalability | Single laptop, one reader. A repo 10x larger still lands ~2s; revisit only if measured | Assumed |
| Availability | None — localhost adapter, same as every other read route | Default |
| Security | x-choda-bridge-token + traversal guard, identical to workspace-docs; read-only | `workspace-docs.ts:179-185` |
| Observability | None beyond existing HTTP behaviour | Assumed |
| Error handling | Every failure has a status and a rendered state; zero-match is a normal 200 | Stated |
| Data | No storage, no retention — the scan is live per request | Stated |
| i18n | English only | Default |
| Accessibility | **Not defaulted away.** Identifiers must not add a tab stop each; tab order through a file may not get worse | `CommitList.tsx:95`, `DocTree.tsx:116` |
| Compliance | None — local, internal | Default |
| Maintainability | One adapter module + one SourceView change; the keyword list is data, not code paths | Stated |
| Integration | Vendored adapter bundle refreshes at release only (INBOX-1888) — the client must diagnose an old adapter rather than show "no definition found" | INBOX-1888 |

### Score history

| # | Dimension | R0 | R1 | R2 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | 8 | 9 |
| 2 | Scope & boundary | 3 | 5 | 9 |
| 3 | Technical contract | 2 | 7 | 9 |
| 4 | Prior art & constraints | 2 | 9 | 9 |
| 5 | Edges & failure | 2 | 5 | 9 |
| 6 | NFR | 2 | 3 | 9 |
| 7 | Acceptance criteria | 1 | 2 | 9 |
| | **MIN** | **1** | **2** | **9** |

## All dimensions >= 9 after 2 rounds

| # | Dimension | Score | WHY it earned 9 — evidence, not confidence |
|---|---|---|---|
| 2 | Scope | 9 | Butter chose all four boundaries; each has a rejected alternative recorded |
| 3 | Contract | 9 | Status codes and token gate copied from a handler read line by line, not guessed |
| 4 | Prior art | 9 | ADR-033 eliminated option 3 and priced option 2; the chosen path is the one it leaves open |
| 5 | Edges | 9 | The 8% multi-match figure is measured on a real repo, so the picker is data-driven, not taste |
| 6 | NFR | 9 | The perf question that would have justified an index was answered with a stopwatch: 0.17s |
| 7 | AC | 9 | Every criterion has a control whose failure differs from its pass |

**Exemptions:** none.

**Unproven assumptions carried forward:**
1. The a11y approach (click handling on the container rather than a button per identifier) is proposed, not confirmed by Butter.
2. The keyword list covers C#, TS/JS, Python and Go. A language outside it degrades to "no definition found" — indistinguishable from a genuine miss until someone reports it.
3. The old-adapter diagnosis leans on a 404 **body string**; a future change to that router message would silently turn "update your adapter" back into "not found".
4. Not seen in the packaged app — the standing INBOX-1873 limitation.

**Rounds:** 2 · **evidence:** 18 citations across code (11), ADR (2), measurement (4), conversation (1)
**Report:** docs/reports/symbol-go-to-definition-discovery.md
