# Graph Report - C:/dev/choda-deck-companion  (2026-05-14)

## Corpus Check
- Corpus is ~4,632 words - fits in a single context window. You may not need a graph.

## Summary
- 79 nodes · 85 edges · 21 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `notifier.toNotifyPayload()` - 8 edges
2. `format.buildBody()` - 6 edges
3. `notifier.processFile() — tail with offset bookkeeping` - 6 edges
4. `ntfy.pushNtfy() — POST with retry+backoff` - 6 edges
5. `README — Brief format (locked 2026-05-14)` - 6 edges
6. `main()` - 5 edges
7. `notifier.startNotifier()` - 5 edges
8. `topic.loadOrCreateTopic()` - 5 edges
9. `format.test.ts — formatCost/Duration/buildTitle/Body/Priority specs` - 5 edges
10. `format.buildTitle()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `README — queue.jsonl artifact contract` --semantically_similar_to--> `notifier.processFile() — tail with offset bookkeeping`  [INFERRED] [semantically similar]
  README.md → packages/notifier/src/notifier.ts
- `README — manual smoke test (PowerShell)` --semantically_similar_to--> `notifier.processFile() — tail with offset bookkeeping`  [INFERRED] [semantically similar]
  README.md → packages/notifier/src/notifier.ts
- `README — topic auto-generation (24-char base58, persisted)` --semantically_similar_to--> `topic.loadOrCreateTopic()`  [INFERRED] [semantically similar]
  README.md → packages/notifier/src/topic.ts
- `README — Brief format (locked 2026-05-14)` --semantically_similar_to--> `format.buildTitle()`  [INFERRED] [semantically similar]
  README.md → packages/notifier/src/format.ts
- `README — Brief format (locked 2026-05-14)` --semantically_similar_to--> `format.buildBody()`  [INFERRED] [semantically similar]
  README.md → packages/notifier/src/format.ts

## Hyperedges (group relationships)
- **Notification dispatch flow: parse line → derive payload → push ntfy** — notifier_process_file, parser_parse_line, notifier_to_notify_payload, ntfy_push_ntfy, format_build_title, format_build_body [EXTRACTED 0.95]
- **Brief format contract: README spec mirrored by build* and asserted by tests** — readme_brief_format, format_build_title, format_build_body, format_build_priority, test_format, test_ntfy [INFERRED 0.90]
- **AC scenarios B/C/D — failedTaskIndex sourcing rule (event → derived → omitted)** — test_notifier_scenario_b, test_notifier_scenario_c, test_notifier_scenario_d, readme_failed_task_index_rule, notifier_to_notify_payload [EXTRACTED 0.90]

## Communities

### Community 0 - "Brief Format Pipeline"
Cohesion: 0.22
Nodes (15): format.buildBody(), format.buildPriority(), format.buildTitle(), format.formatCost(), format.formatDuration(), notifier.startNotifier(), ntfy.pushNtfy() — POST with retry+backoff, README — Brief format (locked 2026-05-14) (+7 more)

### Community 1 - "Event Parsing & Failed-Index Logic"
Cohesion: 0.24
Nodes (10): notifier.toNotifyPayload(), parser.numberOr(), parser.parseLine(), README — failedTaskIndex sourcing rule (event then derived task.started count), notifier.test.ts — skips malformed lines, notifier.test.ts Scenario B — explicit failedTaskIndex, notifier.test.ts Scenario C — derive index from task.started count, notifier.test.ts Scenario D — fallback when index unknown (+2 more)

### Community 2 - "Topic Generation & Persistence"
Cohesion: 0.29
Nodes (8): README — citation ADR-019 autonomous queue runner, README — Phase 1 ntfy notifier, README — queue.jsonl artifact contract, README — topic auto-generation (24-char base58, persisted), topic.test.ts — generateBase58Topic + loadOrCreateTopic specs, topic.generateBase58Topic(), topic.loadOrCreateTopic(), topic.TOPIC_STORE_PATH (~/.choda-deck-companion/notifier.json)

### Community 3 - "Format Module"
Cohesion: 0.47
Nodes (3): buildBody(), formatCost(), formatDuration()

### Community 4 - "CLI Module"
Cohesion: 0.47
Nodes (4): main(), cli.parseArgs(), parseArgs(), printHelp()

### Community 5 - "Watcher Internals"
Cohesion: 0.33
Nodes (6): notifier.processFile() — tail with offset bookkeeping, notifier.scanArtifactsDir(), notifier.stateFor() — per-file StreamState, notifier.trackFile(), README — manual smoke test (PowerShell), notifier.test.ts — picks up queue.jsonl created after startup

### Community 6 - "ntfy Module"
Cohesion: 1.0
Nodes (2): pushNtfy(), sleep()

### Community 7 - "Parser Module"
Cohesion: 0.67
Nodes (0): 

### Community 8 - "Topic Module"
Cohesion: 1.0
Nodes (2): generateBase58Topic(), loadOrCreateTopic()

### Community 9 - "Notifier Test Helpers"
Cohesion: 0.67
Nodes (0): 

### Community 10 - "ntfy Test Helpers"
Cohesion: 0.67
Nodes (0): 

### Community 11 - "Notifier Module"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Graceful Shutdown"
Cohesion: 1.0
Nodes (1): cli.shutdown() — SIGINT/SIGTERM handler

### Community 13 - "Architectural Boundary"
Cohesion: 1.0
Nodes (2): README — citation ADR-008 boundary (non-goals), README — Non-goals (no MCP / SQLite / choda-deck imports; one-way fs read)

### Community 14 - "ESLint Config"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Types Module"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Format Test Module"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Parser Test Module"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Topic Test Module"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Phase 2 Roadmap"
Cohesion: 1.0
Nodes (1): README — Phase 2 HTTP server + viewer + SSE

### Community 20 - "Phase 3 Roadmap"
Cohesion: 1.0
Nodes (1): README — Phase 3 PWA shell

## Knowledge Gaps
- **15 isolated node(s):** `cli.shutdown() — SIGINT/SIGTERM handler`, `notifier.stateFor() — per-file StreamState`, `topic.TOPIC_STORE_PATH (~/.choda-deck-companion/notifier.json)`, `PushFn type`, `notifier.test.ts Scenario B — explicit failedTaskIndex` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Notifier Module`** (2 nodes): `notifier.ts`, `startNotifier()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Graceful Shutdown`** (2 nodes): `cli.shutdown() — SIGINT/SIGTERM handler`, `NotifierHandle.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Architectural Boundary`** (2 nodes): `README — citation ADR-008 boundary (non-goals)`, `README — Non-goals (no MCP / SQLite / choda-deck imports; one-way fs read)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint Config`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Types Module`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Format Test Module`** (1 nodes): `format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Parser Test Module`** (1 nodes): `parser.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Topic Test Module`** (1 nodes): `topic.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Phase 2 Roadmap`** (1 nodes): `README — Phase 2 HTTP server + viewer + SSE`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Phase 3 Roadmap`** (1 nodes): `README — Phase 3 PWA shell`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `notifier.startNotifier()` connect `Brief Format Pipeline` to `CLI Module`, `Watcher Internals`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `main()` connect `CLI Module` to `Brief Format Pipeline`, `Topic Generation & Persistence`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `notifier.toNotifyPayload()` connect `Event Parsing & Failed-Index Logic` to `Brief Format Pipeline`, `Watcher Internals`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `notifier.toNotifyPayload()` (e.g. with `notifier.test.ts Scenario B — explicit failedTaskIndex` and `notifier.test.ts Scenario C — derive index from task.started count`) actually correct?**
  _`notifier.toNotifyPayload()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `notifier.processFile() — tail with offset bookkeeping` (e.g. with `README — queue.jsonl artifact contract` and `README — manual smoke test (PowerShell)`) actually correct?**
  _`notifier.processFile() — tail with offset bookkeeping` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `README — Brief format (locked 2026-05-14)` (e.g. with `format.buildTitle()` and `format.buildBody()`) actually correct?**
  _`README — Brief format (locked 2026-05-14)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `cli.shutdown() — SIGINT/SIGTERM handler`, `notifier.stateFor() — per-file StreamState`, `topic.TOPIC_STORE_PATH (~/.choda-deck-companion/notifier.json)` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._