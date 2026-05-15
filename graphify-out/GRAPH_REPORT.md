# Graph Report - .  (2026-05-15)

## Corpus Check
- 36 files · ~21,974 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 271 nodes · 302 edges · 51 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Hono App (server.ts)` - 12 edges
2. `render()` - 11 edges
3. `QueueView` - 9 edges
4. `handleQueueLive (SSE)` - 9 edges
5. `notifier.toNotifyPayload()` - 8 edges
6. `TasksView` - 8 edges
7. `openDb (readonly + WAL guard)` - 8 edges
8. `withRetry()` - 7 edges
9. `QueueDetailView` - 7 edges
10. `TaskDetailView` - 7 edges

## Surprising Connections (you probably didn't know these)
- `topic.loadOrCreateTopic()` --semantically_similar_to--> `README — topic auto-generation (24-char base58, persisted)`  [INFERRED] [semantically similar]
  packages/notifier/src/topic.ts → README.md
- `notifier.processFile() — tail with offset bookkeeping` --semantically_similar_to--> `README — queue.jsonl artifact contract`  [INFERRED] [semantically similar]
  packages/notifier/src/notifier.ts → README.md
- `notifier.processFile() — tail with offset bookkeeping` --semantically_similar_to--> `README — manual smoke test (PowerShell)`  [INFERRED] [semantically similar]
  packages/notifier/src/notifier.ts → README.md
- `format.buildTitle()` --semantically_similar_to--> `README — Brief format (locked 2026-05-14)`  [INFERRED] [semantically similar]
  packages/notifier/src/format.ts → README.md
- `format.buildBody()` --semantically_similar_to--> `README — Brief format (locked 2026-05-14)`  [INFERRED] [semantically similar]
  packages/notifier/src/format.ts → README.md

## Hyperedges (group relationships)
- **Queue Tab Render Pipeline** — router_render, queue_view, active_run_component, list_row_component, data_queue_runs [EXTRACTED 0.95]
- **Tasks Tab Filter+Group Pipeline** — tasks_view, filter_chips_component, list_row_component, pills_component, meta_priority_rank [EXTRACTED 0.95]
- **Design System Implementation Trio (spec → meta lookups → components)** — ui_md_design_system, meta_module, list_row_component [INFERRED 0.85]
- **SSE Live Queue Pipeline** — routes_handleQueueLive, picker_pickActiveQueueDir, concept_queue_jsonl, routes_sse_keepalive, routes_sse_resume [EXTRACTED 0.95]
- **SQLite Readonly Access Pattern** — sqlite_openDb, sqlite_withRetry, sqlite_DbBusyError, sqlite_DbSchemaError, sqlite_schema_guard [EXTRACTED 0.90]
- **Phase 2 Companion Spike Gates (A+B)** — doc_spike_marked, doc_spike_sse, doc_task_739 [EXTRACTED 0.90]

## Communities

### Community 0 - "Handoff UI Prototype"
Cohesion: 0.09
Nodes (35): ActiveRun Component, Active Run Tick Interval (1.5s), App Bootstrap (window.app), Component Split Decision (IIFE globals), QUEUE_REPORTS Mock, QUEUE_RUNS Mock, TASKS Mock, DetailHeader Component (+27 more)

### Community 1 - "Queue Run Artifacts (TS)"
Cohesion: 0.1
Nodes (29): ArtifactsDirError, QueueRunMeta Interface, QueueRunNotFoundError, getQueueRun, inferStatus (running/finished/failed), listQueueRuns, handleConversationGet, handleConversationList (+21 more)

### Community 2 - "Notifier Pipeline"
Cohesion: 0.12
Nodes (20): notifier.processFile() — tail with offset bookkeeping, notifier.scanArtifactsDir(), notifier.stateFor() — per-file StreamState, notifier.toNotifyPayload(), notifier.trackFile(), parser.numberOr(), parser.parseLine(), README — citation ADR-019 autonomous queue runner (+12 more)

### Community 3 - "SSE Stream Design"
Cohesion: 0.12
Nodes (16): queue.jsonl Event Stream, ADR-019 queue.jsonl event schema, server README, Spike Gate B — Hono SSE on Windows, Rationale: Per-event id for Last-Event-ID resume, Rationale: 15s comment-line keep-alive, Rationale: Use streamSSE over polling, TASK-739 Phase 2 viewer (+8 more)

### Community 4 - "Notification Formatting"
Cohesion: 0.22
Nodes (15): format.buildBody(), format.buildPriority(), format.buildTitle(), format.formatCost(), format.formatDuration(), notifier.startNotifier(), ntfy.pushNtfy() — POST with retry+backoff, README — Brief format (locked 2026-05-14) (+7 more)

### Community 5 - "SQLite Data Access"
Cohesion: 0.23
Nodes (9): DbBusyError, DbSchemaError, getConversationThread(), getInboxItem(), getTask(), queryConversations(), queryInboxItems(), queryTasks() (+1 more)

### Community 6 - "ADRs & Config"
Cohesion: 0.15
Nodes (12): ADR-008 (core no-UI), ADR-019 queue.jsonl schema, Dark Mode Force-Lock Decision, Chat 1 — Thiết kế UI Transcript, Handoff Bundle README, Router.setTitle() (badge), Companion UI Design System, Gate B — Hono SSE smoke (+4 more)

### Community 7 - "CLI Module"
Cohesion: 0.27
Nodes (8): main(), cli.parseArgs(), parseArgs(), printHelp(), topic.test.ts — generateBase58Topic + loadOrCreateTopic specs, topic.generateBase58Topic(), topic.loadOrCreateTopic(), topic.TOPIC_STORE_PATH (~/.choda-deck-companion/notifier.json)

### Community 8 - "Artifacts Module (legacy IDs)"
Cohesion: 0.29
Nodes (4): ArtifactsDirError, inferStatus(), listQueueRuns(), QueueRunNotFoundError

### Community 9 - "Format Helpers (legacy IDs)"
Cohesion: 0.47
Nodes (3): buildBody(), formatCost(), formatDuration()

### Community 10 - "JS Utility Helpers"
Cohesion: 0.33
Nodes (0): 

### Community 11 - "Filter Chips Component"
Cohesion: 0.4
Nodes (0): 

### Community 12 - "Queue API Route"
Cohesion: 0.4
Nodes (0): 

### Community 13 - "Data Mock Module"
Cohesion: 0.5
Nodes (0): 

### Community 14 - "Tasks API Route"
Cohesion: 0.5
Nodes (0): 

### Community 15 - "Run Picker"
Cohesion: 1.0
Nodes (3): parseQueueRunId(), parseStartedAt(), pickActiveQueueDir()

### Community 16 - "Conversations API Route"
Cohesion: 0.83
Nodes (3): handleConversationGet(), handleConversationList(), handleDbError()

### Community 17 - "Routes Test Harness"
Cohesion: 0.5
Nodes (0): 

### Community 18 - "Token Auth"
Cohesion: 0.5
Nodes (4): Token Auth LAN Mode (README), genToken base58, LAN Mode (--bind 0.0.0.0), LAN Token Middleware

### Community 19 - "Ntfy Pusher"
Cohesion: 1.0
Nodes (2): pushNtfy(), sleep()

### Community 20 - "Log Line Parser"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "Topic Generator"
Cohesion: 1.0
Nodes (2): generateBase58Topic(), loadOrCreateTopic()

### Community 22 - "Notifier Tests"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Ntfy Tests"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "List Row Component"
Cohesion: 1.0
Nodes (2): chevron(), render()

### Community 25 - "Pills Component"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Server Entry"
Cohesion: 0.67
Nodes (0): 

### Community 27 - "Inbox API Route"
Cohesion: 0.67
Nodes (0): 

### Community 28 - "Helpers Tests"
Cohesion: 0.67
Nodes (0): 

### Community 29 - "Notifier Bootstrap"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Shutdown Coordination"
Cohesion: 1.0
Nodes (1): cli.shutdown() — SIGINT/SIGTERM handler

### Community 31 - "README ADR-008 Section"
Cohesion: 1.0
Nodes (2): README — citation ADR-008 boundary (non-goals), README — Non-goals (no MCP / SQLite / choda-deck imports; one-way fs read)

### Community 32 - "App Bootstrap"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "ActiveRun Component"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Detail Header Component"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Queue Detail View"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Task Detail View"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Meta Iconography"
Cohesion: 1.0
Nodes (2): window.Meta Module, Iconography Catalog (Tabler outline)

### Community 38 - "Filter Chip Spec"
Cohesion: 1.0
Nodes (2): FilterChips.parseFilter() URL state, Filter Chip Strip Spec (multi-select OR)

### Community 39 - "Marked.js Spike"
Cohesion: 1.0
Nodes (2): Spike Gate A — marked.js fixture, marked@12.0.1 (cdnjs)

### Community 40 - "Types"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Format Tests"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Parser Tests"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Topic Tests"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "README Phase 2"
Cohesion: 1.0
Nodes (1): README — Phase 2 HTTP server + viewer + SSE

### Community 45 - "README Phase 3"
Cohesion: 1.0
Nodes (1): README — Phase 3 PWA shell

### Community 46 - "Meta (single)"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Data Tests"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Picker Tests"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Data Module (singleton)"
Cohesion: 1.0
Nodes (1): window.Data Module

### Community 50 - "Utils Module (singleton)"
Cohesion: 1.0
Nodes (1): window.Utils Module

## Knowledge Gaps
- **54 isolated node(s):** `cli.shutdown() — SIGINT/SIGTERM handler`, `notifier.stateFor() — per-file StreamState`, `topic.TOPIC_STORE_PATH (~/.choda-deck-companion/notifier.json)`, `PushFn type`, `notifier.test.ts Scenario B — explicit failedTaskIndex` (+49 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Notifier Bootstrap`** (2 nodes): `notifier.ts`, `startNotifier()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shutdown Coordination`** (2 nodes): `cli.shutdown() — SIGINT/SIGTERM handler`, `NotifierHandle.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `README ADR-008 Section`** (2 nodes): `README — citation ADR-008 boundary (non-goals)`, `README — Non-goals (no MCP / SQLite / choda-deck imports; one-way fs read)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Bootstrap`** (2 nodes): `app.js`, `boot()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ActiveRun Component`** (2 nodes): `active-run.js`, `render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Detail Header Component`** (2 nodes): `detail-header.js`, `render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Queue Detail View`** (2 nodes): `queue-detail.js`, `render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task Detail View`** (2 nodes): `task-detail.js`, `render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Meta Iconography`** (2 nodes): `window.Meta Module`, `Iconography Catalog (Tabler outline)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Filter Chip Spec`** (2 nodes): `FilterChips.parseFilter() URL state`, `Filter Chip Strip Spec (multi-select OR)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Marked.js Spike`** (2 nodes): `Spike Gate A — marked.js fixture`, `marked@12.0.1 (cdnjs)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Format Tests`** (1 nodes): `format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Parser Tests`** (1 nodes): `parser.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Topic Tests`** (1 nodes): `topic.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `README Phase 2`** (1 nodes): `README — Phase 2 HTTP server + viewer + SSE`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `README Phase 3`** (1 nodes): `README — Phase 3 PWA shell`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Meta (single)`** (1 nodes): `meta.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Data Tests`** (1 nodes): `data.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Picker Tests`** (1 nodes): `picker.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Data Module (singleton)`** (1 nodes): `window.Data Module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Utils Module (singleton)`** (1 nodes): `window.Utils Module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Hono App (server.ts)` connect `Queue Run Artifacts (TS)` to `Token Auth`, `SSE Stream Design`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `handleQueueLive (SSE)` connect `SSE Stream Design` to `Queue Run Artifacts (TS)`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `QueueDetailView` connect `Handoff UI Prototype` to `ADRs & Config`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `handleQueueLive (SSE)` (e.g. with `SSE Windows Spike Server` and `Rationale: Use streamSSE over polling`) actually correct?**
  _`handleQueueLive (SSE)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `notifier.toNotifyPayload()` (e.g. with `notifier.test.ts Scenario B — explicit failedTaskIndex` and `notifier.test.ts Scenario C — derive index from task.started count`) actually correct?**
  _`notifier.toNotifyPayload()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `cli.shutdown() — SIGINT/SIGTERM handler`, `notifier.stateFor() — per-file StreamState`, `topic.TOPIC_STORE_PATH (~/.choda-deck-companion/notifier.json)` to the rest of the system?**
  _54 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Handoff UI Prototype` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._