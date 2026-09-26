---
requirement: "tôi muốn record lại toàn bộ hành động của tôi và tất cả những gì tôi thao tác trên máy tính, sau đó cứ mỗi ngày bạn summary lại những cái đó và sau 1 2 ngày bạn coi thử là tôi đang bị vấn đề gì và cần build tool hay skill gì hay cần enhance UI gì để giúp tôi cải thiện được performance"
started: 2026-09-26
workspace: Companion
status: converged
---

# Discovery — Record all computer activity, summarize daily, diagnose what to build

Discovery thread: CONV-1790408699573-1

## Round 1 — activity recorder + daily summary + diagnosis

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| vault | Personalizing AI (skills/tools for daily work) is the #1 pillar, so this requirement serves a stated goal | vault/20-Areas/goals.md "Pillar 4: Personalize AI ⭐ #1 PRIORITY" |
| vault | Butter already runs a daily retro and works across several projects at once, so a daily cadence fits the existing habit | vault/20-Areas/workflow.md "Retro: Daily", "Butter làm như SWAT — multi-project" |
| vault | Butter wants to be asked before scope is assumed | vault/20-Areas/preferences.md "Không assume … hỏi lại Butter" |
| disk | 26 Claude Code transcripts in the last 48h (675 MB total), and 3 repos had live sessions at the same time: companion, juvenis-maxime, remote-headless-cms. A rich activity source already exists | ~/.claude/projects/**/*.jsonl (find -mtime -2, 2026-09-26 14:45) |
| code | A transcript parser exists, but it only extracts the last assistant text, for resumePoint | choda-deck/src/core/domain/session-transcript.ts:13-19; session-tools.ts:455 |
| code | Work-session activity is already stored: `sessions`, `session_events`, and `tool_invocations` for every MCP call | choda-deck/src/core/domain/repositories/schema.ts:563,770,783; instrumented-server.ts:60 |
| code | The file-edit hook fires only for Edit/Write/MultiEdit and only while a choda session is active. Bash edits are invisible to it | choda-deck/scripts/hooks/file-edit-event.mjs:1-25 |
| code | `stats_report` covers MCP tools only: no per-project or per-session view, and no daily digest | choda-deck/src/core/domain/stats-service.ts:39 |
| code | Companion is an Electron app. Its main process can reach desktopCapturer, powerMonitor and Tray. It has a tray but no close-to-tray, and it starts at login when packaged | companion electron/main.cjs:56-60; login-item.cjs; display-media.cjs |
| code | Nothing found for OS window/app focus, idle, keystrokes, clipboard, browser history, background screenshots, a daily scheduler, or a time-bucketed activity table | Explore sweep of choda-deck + companion + gateway (negative result) |
| ADR | No ADR covers or rejects activity tracking. The closest match is the session lifecycle | knowledge_search → feature-session-lifecycle (distance 1.07, not about this) |
| env | This is a corporate Windows 11 Enterprise (Mantu) machine, so keystroke or screen logging may conflict with employer IT/DLP policy | session environment: "Windows 11 Enterprise 10.0.26200", user hngo1_mantu |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 5 | Goal is stated (goals.md Pillar 4) and the multi-project pattern is observed, but no concrete "I lost time here" example exists | 1-2 concrete days or symptoms from Butter |
| 2 | Scope & boundary | 2 | "Toàn bộ" is unbounded. Nothing is explicitly out | **Human decision:** capture tier + what is never recorded |
| 3 | Technical contract | 4 | Existing sources and their shapes are known (schema.ts:563/770/783, transcript jsonl). The new capture contract depends on #2 | Scope from #2 → read transcript row shape + define the activity row |
| 4 | Prior art | 7 | Sweep found no existing recorder or digest, and no ADR rejects one | Check the local-only / privacy ADR for companion captures |
| 5 | Edges & failure | 2 | Only reasoning: laptop sleep, 3 parallel sessions, a 675 MB transcript volume | Blocked on #2 |
| 6 | NFR | 1 | Privacy/legal on a corporate machine is the dominant NFR. Nothing is answered yet | #2 + employer policy answer |
| 7 | Acceptance criteria | 0 | No contract yet | Blocked on #3, #5 |

**TOTAL = MIN = 0** (dimension 7). Blocked upstream on dimension 2, which is a human decision.
Previous round: 0 (round 0) → this round: 0. New evidence? **YES** (12 sources).

### Score history
| # | Dimension | R0 | R1 |
|---|---|---|---|
| 1 | Problem & value | 3 | 5 |
| 2 | Scope & boundary | 1 | 2 |
| 3 | Technical contract | 1 | 4 |
| 4 | Prior art | 2 | 7 |
| 5 | Edges & failure | 1 | 2 |
| 6 | NFR | 1 | 1 |
| 7 | Acceptance criteria | 0 | 0 |
| | **MIN** | **0** | **0** |

### Stop condition: blocked on a human decision (§5)
More searching cannot settle dimension 2. The blocking questions:
1. Capture tier:
   - **A.** Claude/dev activity only: transcripts, choda sessions, git. This needs no new recorder.
   - **B.** A + an OS app/window-focus timeline with idle detection.
   - **C.** B + periodic screenshots.
   - Keystrokes: proposed as explicitly out.
2. What must never be recorded (apps, sites, windows), and whether employer policy allows B or C on this machine.
3. Where the daily summary lands and where the diagnosis output goes (inbox items? a vault daily note? a companion view?).
4. One or two concrete symptoms of "slow" today.

### Round 2 will look for exactly this
- Butter's answers in CONV-1790408699573-1 (#1, #2, #6)
- Row shape of a Claude transcript jsonl, including the token and tool-use fields (#3)
- The local-only guard in capture-dispatcher.ts:55,75 and the related ADR (#4)

## Round 2 — activity recorder + daily summary + diagnosis

Thread: there are no new messages in CONV-1790408699573-1. Butter answered the round-1 blocking questions in chat instead, via AskUserQuestion on 2026-09-26.

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| human (chat) | Capture tier **A**: Claude/dev activity only (transcripts, choda sessions, git). OS focus tracking, keystrokes and screenshots are **out** | AskUserQuestion answer, 2026-09-26 |
| human (chat) | Outputs go to three places: a **companion view**, **inbox items** and a **conversation thread** | same |
| human (chat) | Symptoms: context switching, waiting on or re-reviewing Claude, repetitive manual actions, and "don't know, need data" | same |
| disk | `history.jsonl` holds 19,375 prompts with `display, timestamp, project, sessionId`. 221 of them fall in the last 48h, and 34 of those (~15%) start with "okay" or "y", which are confirmation turns. This is the first signal for the "waiting/review" symptom | ~/.claude/history.jsonl (node profile, 2026-09-26) |
| disk | Transcript rows carry `timestamp, cwd, gitBranch, sessionId, isSidechain, message.usage` (token counts), tool_use names, `durationMs`, `toolDenialKind` and `attributionSkill`. One 90-minute session had 1006 rows, 14 human prompts and 115 Bash calls | ~/.claude/projects/C--dev-insfrastrucure-juvenis-maxime/6b0cb743….jsonl (node profile) |
| code | Companion **deliberately refuses** to root at ~/.claude because "history.jsonl, sessions/, projects/ … every prompt ever typed". So raw transcripts must not be served through a companion route | choda-deck/src/adapters/companion/claude-config.ts:9-15 |
| ADR | inbox and task writes sync to the remote. conversation and knowledge are local-only by design. So the diagnosis inbox items must not carry raw prompt text | ADR-036-companion-capture-bridge §Decision 5 |
| code | The companion adapter has no timer or scheduler. Its only "schedule" is the meeting audio cap | grep setInterval/cron in src/adapters/companion (meetings.ts:236 only) |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 8 | Symptoms are named (chat), and there is a first quantitative signal: 15% confirmation turns (history.jsonl) | A definition of "improved": which metric should move, and by how much |
| 2 | Scope & boundary | 8 | Tier A in; OS, keystrokes and screenshots out; three output surfaces named | Retention window + whether subagent transcripts count |
| 3 | Technical contract | 6 | Both source shapes have been read (transcript keys, history keys). There is still no sink or runtime contract | **Human decision:** where the digest is computed and stored (see question) |
| 4 | Prior art | 9 | ADR-036 §5 sync boundary; claude-config.ts:9-15 ~/.claude exclusion; no existing digest (round-1 sweep) | — |
| 5 | Edges & failure | 5 | Listed from the evidence: the machine is off at digest time (no scheduler exists), parallel sessions overlap, subagent jsonl gets double-counted (isSidechain), /clear splits a session, 675 MB to parse | Settle each edge against the chosen runtime |
| 6 | NFR | 5 | Privacy: a remote-synced inbox rules out raw prompts in it (ADR-036). Perf: the 675 MB corpus has to be parsed incrementally | Retention, redaction rule, digest-time budget |
| 7 | Acceptance criteria | 2 | Blocked on #3 | — |

**TOTAL = MIN = 2** (dimension 7). Previous round: 0 → this round: 2. New evidence? **YES** (8 sources).

### Score history
| # | Dimension | R0 | R1 | R2 |
|---|---|---|---|---|
| 1 | Problem & value | 3 | 5 | 8 |
| 2 | Scope & boundary | 1 | 2 | 8 |
| 3 | Technical contract | 1 | 4 | 6 |
| 4 | Prior art | 2 | 7 | 9 |
| 5 | Edges & failure | 1 | 2 | 5 |
| 6 | NFR | 1 | 1 | 5 |
| 7 | Acceptance criteria | 0 | 0 | 2 |
| | **MIN** | **0** | **0** | **2** |

### Stop condition: blocked on a human decision (§5)
Dimension 3 needs an architecture call: the runtime and storage for the digest, the retention period, and the improvement metric.

### Round 3 will look for exactly this
- Butter's runtime/storage answer (#3)
- The companion view pattern (KnowledgeView.tsx / Shell.tsx) and the companion REST read-endpoint shape, for the view contract (#3)
- inbox_add / conversation_add field contracts for the diagnosis output (#3 → #7)

## Round 3 — activity recorder + daily summary + diagnosis

Thread: there are no new messages in CONV-1790408699573-1. Butter answered in chat via AskUserQuestion on 2026-09-26.

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| human (chat) | Runtime: a **skill plus catch-up**. A scheduled `claude -p` reads the transcripts and history, and the companion reads only derived digests | AskUserQuestion answer, 2026-09-26 |
| human (chat) | Improvement metrics: tasks shipped per day, % confirmation/correction turns, time spent waiting on Claude, project switches per hour | same |
| human (chat) | Retention: **90 days** of digests | same |
| code | Precedent for a file-backed companion store: meetings live at `<artifactsDir>/meetings/<id>/meta.json`. So digests can live at `<artifactsDir>/activity/<date>.json` with no schema migration and no Postgres parity work | choda-deck/src/adapters/companion/meetings.ts:143,171,229; src/core/paths.ts:65 |
| code | The companion REST router is a flat `switch` (/tasks, /inbox, /conversations …). A GET `/activity/digests` route slots in there | choda-deck/src/adapters/companion/http-server.ts:316-361 |
| code | A choda-deck CLI binary already exists, which can host a deterministic `activity digest` command | choda-deck/package.json `bin.choda-deck = dist/cli.cjs` |
| code | `tasks` has no DONE timestamp (only `updated_at`), and there is no status-history table. `sessions` has `ended_at` + `status`. So "tasks shipped/day" needs a proxy | choda-deck/src/core/domain/repositories/schema.ts:117-129,563-570 |
| env | A Windows Task Scheduler precedent exists: `\ChodaCompanionServer`, set to "At logon time" and running wscript hidden. At-logon covers the "machine was off" case | `schtasks /query /tn \ChodaCompanionServer /v` |
| env | `claude` on PATH resolves via an ephemeral `fnm_multishells/<pid>` dir, so a scheduled task must use an absolute path (…/fnm/node-versions/v24.15.0/installation/claude.cmd or %APPDATA%/npm/claude.cmd) | `which claude`; ls of both paths |
| bench | One day of transcripts is 71 MB and 16,433 rows (0 unparseable), and takes 13.6 s wall to read and parse | find -mtime -1 \| node parse, 2026-09-26 |
| disk | Transcript timestamps are UTC (`…Z`), so day bucketing must convert to local time | transcript sample `first: 2026-09-26T06:32:14.804Z` (round 2 profile) |

### Draft contract (for dimension 3)
- **CLI** `choda-deck activity digest [--date YYYY-MM-DD] [--catch-up]`. It is deterministic (no LLM) and writes `<artifactsDir>/activity/<local-date>.json`. Running it twice produces the same file. `--catch-up` fills any missing date within the last 7 days. Every run deletes digest files older than 90 days.
- **Digest JSON** `{ date, tz, generatedAt, claudeCodeVersions[], sources:{transcriptFiles, rows, badRows, historyRows}, metrics:{ prompts, confirmationTurns, confirmationRate, waitMinutes, activeMinutes, projectSwitches, switchesPerActiveHour, parallelSessionsPeak, sessionsCompleted, mergesToDefault, toolMix{}, toolDenials, skillsUsed{}, tokens{in,out,cacheRead}, byProject[{cwd,prompts,activeMinutes,tokens}] , repeatedPrompts[{normalized,count}] } }`
- **Companion** `GET /activity/digests?from=&to=` → 200 with a digest array (missing days are omitted), 400 on a malformed date. A new view reads this route. The companion never touches ~/.claude.
- **Skill** `/daily-digest`:
  - Runs the CLI with `--catch-up`.
  - Posts a narrative summary of the day to a standing local-only conversation, "Activity digest".
  - Once ≥2 new digests exist since the last diagnosis, posts a diagnosis there too, plus one `inbox_add` per proposed tool, skill or UI change. Inbox items carry metrics and patterns only, never raw prompt text (ADR-036 §5).
- **Scheduler**: a Windows task running at logon and at 09:00 daily: `<abs>/claude.cmd -p "/daily-digest"`.

### NFR (12/12)
| Category | Requirement | Source |
|---|---|---|
| Performance | Digest ≤ 60 s per day of data (measured 13.6 s for 71 MB) | bench |
| Scalability | Single user, one machine. Parsing is incremental per date | Assumed |
| Availability | No SLA. Catch-up at logon covers missed days | Stated (catch-up) + schtask precedent |
| Security | Digests stay local in the data dir and are never synced. Inbox gets no raw prompts. Companion never reads ~/.claude | ADR-036 §5, claude-config.ts:9-15 |
| Observability | Each digest records its source counts, badRows and CC versions | Assumed |
| Error handling | Skip unparseable lines and count them. A missing source gives a partial digest with a `sources` flag rather than a failure | Assumed |
| Data | 90-day retention, enforced by the CLI | Stated |
| i18n | Artifacts in English. Days bucketed in local time (Asia/Ho_Chi_Minh) | CLAUDE.md language rule; UTC timestamps |
| Accessibility | Not required. The view follows the existing companion conventions | Default + feedback_check_handoff_design |
| Compliance | Tier A only on the corporate machine: no OS, keystroke or screen capture | Stated |
| Maintainability | Butter maintains it. Metric code is unit-tested against fixture jsonl | Assumed |
| Integration | The transcript jsonl is an **undocumented internal Claude Code format** and may change between versions | Known gap |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Symptoms and 4 success metrics are stated (chat), with a 15% confirmation baseline (history.jsonl) | — |
| 2 | Scope & boundary | 9 | Tier A; OS capture out; 90d; outputs are view + inbox + conversation (chat ×2) | — |
| 3 | Technical contract | 8 | Draft grounded in meetings.ts store, paths.ts:65, http-server.ts switch, CLI bin | "shipped/day" proxy unverified: `mergesToDefault` source not yet tested across repos |
| 4 | Prior art | 9 | Unchanged from R2 | — |
| 5 | Edges & failure | 7 | Machine off → at-logon (schtask), PATH → absolute path, UTC→local, run twice → overwrite, bad lines counted | Verify the `waitMinutes` definition against a real parallel-session day |
| 6 | NFR | 8 | 12/12 answered above | Integration: pin a format guard (unknown row types counted, CC version recorded) |
| 7 | Acceptance criteria | 3 | Contract is drafted, but ACs are not written yet | Write them after #3/#5 are verified |

**TOTAL = MIN = 3** (dimension 7). Previous round: 2 → this round: 3. New evidence? **YES** (11 sources).

### Score history
| # | Dimension | R0 | R1 | R2 | R3 |
|---|---|---|---|---|---|
| 1 | Problem & value | 3 | 5 | 8 | 9 |
| 2 | Scope & boundary | 1 | 2 | 8 | 9 |
| 3 | Technical contract | 1 | 4 | 6 | 8 |
| 4 | Prior art | 2 | 7 | 9 | 9 |
| 5 | Edges & failure | 1 | 2 | 5 | 7 |
| 6 | NFR | 1 | 1 | 5 | 8 |
| 7 | Acceptance criteria | 0 | 0 | 2 | 3 |
| | **MIN** | **0** | **0** | **2** | **3** |

### Round 4 will look for exactly this
- Prototype `mergesToDefault` via local `git log` across every workspace cwd (#3)
- Prototype `waitMinutes`, `projectSwitches` and `confirmationRate` on the 2026-09-25 data (#5)
- Write ACs (#7)

## Round 4 — activity recorder + daily summary + diagnosis

Thread: there are no new messages in CONV-1790408699573-1.

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| prototype | The metrics compute on real data for 2026-09-25 (local UTC+7): 31 files, 7,279 rows, 0 bad, 111 human prompts, 9 confirmations (8%), 356 min of Claude running, **207 min of idle-waiting** out of 460 active min (45%), 12 tool denials, CC version 2.1.281. It took **0.8 s** | scratchpad/proto-digest.cjs run 2026-09-26 |
| prototype | Rows typed `frame-link`, `pr-link`, `queue-operation`, `file-history-delta` and others appear alongside user/assistant. So the format drifts, and metrics must key only on `user`/`assistant` and count the rest | same run, `types` |
| prototype | Switches normalized by longest-prefix match on registered workspace cwds: **62 switches over 111 prompts**. Subdirs resolve correctly. 14 prompts (13%) fall in unregistered or pruned-worktree cwds (`cdc-task-2143`, `c:/dev/test`, `c:/tmp/bpa-guide`) | scratchpad/proto-switch.cjs run 2026-09-26 |
| git | The worktree `C:/dev/cdc-task-2143` no longer exists the next day, so worktree cwds cannot be resolved retroactively and must be reported as `unresolvedPrompts` | `[ -d /c/dev/cdc-task-2143 ]` → MISSING |
| git | `mergesToDefault` works by resolving the default branch with `git symbolic-ref refs/remotes/origin/HEAD` (main *or* master), then running `git log --first-parent --since/--until` in local tz. Result for 9/25: choda-deck 2, companion 5, remote-bpa 4 (master), bpa-engine 0, juvenis-maxime 1, JM.AI 3 | git loop over 6 workspace cwds, 2026-09-26 |

### Acceptance criteria (draft for conversion)
- [ ] AC-1: Given a fixture transcript with rows at `2026-09-24T16:59Z` and `2026-09-24T17:01Z` and tz Asia/Ho_Chi_Minh, when `choda-deck activity digest --date 2026-09-25` runs, then `metrics.prompts` counts only the 17:01Z row. (CLI unit)
- [ ] AC-2: Given a fixture with 1 unparseable line and 1 row of unknown `type`, when the digest runs, then it exits 0 with `sources.badRows = 1` and `sources.unknownTypes = 1`. (CLI unit)
- [ ] AC-3: Given the same inputs, when the digest runs twice, then both output files are identical apart from `generatedAt`. (CLI unit)
- [ ] AC-4: Given a fixture where a sidechain row has a text-only `user` message plus one `tool_use`, then that row is excluded from `prompts` and included in `toolMix`. (CLI unit)
- [ ] AC-5: Given prompts "okay", "y", "fix the null check in X", then `confirmationTurns = 2` and `confirmationRate = 0.67`. (CLI unit)
- [ ] AC-6: Given session A (prompt 10:00, last assistant 10:10) and session B (prompt 10:05), then `claudeRunMinutes` includes A's 10 min and `waitMinutes` excludes it, because B was typed inside A's window. (CLI unit)
- [ ] AC-7: Given prompts in cwd `<ws>/docs/reports`, then `<ws>`, then `C:/tmp/x`, with `<ws>` registered, then `projectSwitches = 1` and `unresolvedPrompts = 1`. (CLI unit)
- [ ] AC-8: Given a temp git repo whose `origin/HEAD` points at `master` and has 2 first-parent commits inside the local day, then `mergesToDefault = 2`. (CLI unit)
- [ ] AC-9: Given digest files dated today−91 and today−89 in `<artifactsDir>/activity/`, when any digest run completes, then the −91 file is gone and the −89 file remains. (CLI unit)
- [ ] AC-10: Given files for today−1 and today−3 but none for today−2, when `--catch-up` runs, then exactly today−2 is created and the other two keep their mtime. (CLI unit)
- [ ] AC-11: `GET /activity/digests?from=2026-09-24&to=2026-09-25` returns 200 with the stored digests ascending, missing dates omitted. `from=2026-13-01` returns 400. (companion adapter integration)
- [ ] AC-12: The companion adapter route source contains no reference to `.claude`. Grep of the route module → 0 hits. (static check)
- [ ] AC-13: The companion activity view shows the 4 success metrics as a per-day trend from `/activity/digests`, following KnowledgeView conventions. (human: screenshot)
- [ ] AC-14: `/daily-digest` posts one message per digested date to a local-only "Activity digest" conversation. Once ≥2 new digests exist since the last diagnosis, it posts a diagnosis and creates ≥1 inbox item. No inbox item contains any ≥20-char substring of that day's prompt text. (human-run skill + machine substring check)
- [ ] AC-15: `schtasks /query /tn \ChodaActivityDigest /xml` shows a LogonTrigger and a daily 09:00 CalendarTrigger, and its action is an absolute `claude.cmd` path not under `fnm_multishells`. (machine)

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Baseline measured (9/25): 45% idle-wait, 62 switches/111 prompts, 8% confirmations, 15 commits on default across 6 repos | — |
| 2 | Scope & boundary | 9 | Unchanged (R3) | — |
| 3 | Technical contract | 9 | Every metric now has a working computation on real data (proto-digest/proto-switch, git loop). The shipped proxy is `sessionsCompleted` + `mergesToDefault`, and the main/master default branch is resolved | — |
| 4 | Prior art | 9 | Unchanged (R2) | — |
| 5 | Edges & failure | 9 | Each edge has a handling, verified on data: UTC→local (AC-1), bad/unknown rows (AC-2), run twice (AC-3), sidechain (AC-4), parallel sessions (AC-6), subdir and pruned-worktree cwds (AC-7), master/main (AC-8), missed days (AC-10) | — |
| 6 | NFR | 9 | Integration gap closed: the format guard keys on user/assistant only and counts unknown types plus CC version (drift observed: frame-link, pr-link). Perf is 0.8 s per day | — |
| 7 | Acceptance criteria | 9 | 15 checkbox ACs, each naming its surface, each with distinct pass/fail values | — |

**TOTAL = MIN = 9**. Previous round: 3 → this round: 9. New evidence? **YES** (5 sources).

### Score history
| # | Dimension | R0 | R1 | R2 | R3 | R4 |
|---|---|---|---|---|---|---|
| 1 | Problem & value | 3 | 5 | 8 | 9 | 9 |
| 2 | Scope & boundary | 1 | 2 | 8 | 9 | 9 |
| 3 | Technical contract | 1 | 4 | 6 | 8 | 9 |
| 4 | Prior art | 2 | 7 | 9 | 9 | 9 |
| 5 | Edges & failure | 1 | 2 | 5 | 7 | 9 |
| 6 | NFR | 1 | 1 | 5 | 8 | 9 |
| 7 | Acceptance criteria | 0 | 0 | 2 | 3 | 9 |
| | **MIN** | **0** | **0** | **2** | **3** | **9** |

## ✅ All dimensions ≥ 9 after 4 rounds

| # | Dimension | Score | WHY it earned 9 — evidence, not confidence |
|---|---|---|---|
| 1 | Problem & value | 9 | Butter named the symptoms and 4 success metrics (chat). The 9/25 baseline is 207/460 active min idle-waiting and 62 workspace switches (proto-digest, proto-switch) |
| 2 | Scope & boundary | 9 | Tier A only; OS, keystroke and screen capture explicitly out on a corporate machine; 90d retention; 3 output surfaces (chat ×2) |
| 3 | Technical contract | 9 | CLI → `<artifactsDir>/activity/<date>.json` (meetings.ts file-store precedent, paths.ts:65) → `GET /activity/digests` (http-server.ts:316 switch). Every metric was computed on real data |
| 4 | Prior art | 9 | ADR-036 §5: inbox syncs to the remote, so no raw prompts go there. claude-config.ts:9-15: the companion never reads ~/.claude. No existing digest found (round-1 sweep) |
| 5 | Edges & failure | 9 | 8 edges, each with a handling and an AC (AC-1..AC-10) |
| 6 | NFR | 9 | 12/12 answered (R3 table) plus the format-drift guard, backed by observed drift |
| 7 | Acceptance criteria | 9 | AC-1..AC-15: 12 machine, 1 static, 2 human-driven (AC-13 view, AC-14 skill output) |

Exemptions: none

Unproven assumptions carried forward:
- "Tasks shipped" is approximated by `sessionsCompleted + mergesToDefault`. tasks has no DONE timestamp (schema.ts:117-129).
- Prompts in pruned worktrees count as `unresolvedPrompts` (13% on 9/25) and are not attributed to a workspace.
- The confirmation-turn regex is a heuristic. It found 8% by exact match versus ~15% by first word in history.jsonl.
- `claude -p "/daily-digest"` running unattended under Task Scheduler (permission mode, MCP availability) is untested.
- Only the Claude Code transcript format of v2.1.281 has been observed.

Rounds: 4 · evidence gathered: 36 citations across code (11), human/chat (7), disk/bench/prototype (9), ADR/vault (6), env/git (3)
Report: docs/reports/activity-recorder-daily-diagnosis-discovery.md
