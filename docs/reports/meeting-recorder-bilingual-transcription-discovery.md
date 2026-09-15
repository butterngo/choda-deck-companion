---
requirement: Choda Companion records a client meeting, transcribes it (Vietnamese + English), and summarises it into a note — because Butter cannot take notes during the meeting and has no evidence to re-discuss with the client
started: 2026-09-15
workspace: Companion
status: min-8-pending-approval
---

# Discovery — meeting recorder + bilingual (VI/EN) transcription and summary

Thread: CONV-1789453938305-1

## Round 1 — meeting recorder + bilingual transcription

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| conversation | round 0 — thread just opened, no messages yet | CONV-1789453938305-1 |
| code | Electron already grants getDisplayMedia — video only, no audio ("this is a screenshot, no audio"). Loopback audio extends an existing handler. | electron/main.cjs:74-86 |
| code | No preload, no IPC bridge (contextIsolation true, nodeIntegration false, no preload file in repo). Renderer cannot write files; bytes must go through the REST adapter. | electron/main.cjs:179-184 |
| code | Binary-write contract exists: capture artifacts write under <artifactsDir>/captures/, return {filePath, relPath, bytes}, served by GET /artifacts/<relPath>. | choda-deck/src/adapters/companion/capture-artifacts.ts:18-62; http-server.ts:110 |
| code | Electron ^34.5.8 — setDisplayMediaRequestHandler supports audio:'loopback' on Windows (since 31). | package.json:77 |
| ADR | english-companion records a shared-tab audio track via MediaRecorder -> WebM/Opus, proven in the real Electron runtime, ~0.92 MB/min, opt-in, stored as BLOB. Zero new deps. | adr-006-watch-audio-capture-persist-shared-tab-audio |
| ADR | Privacy stance narrowed, not reversed: mic audio ephemeral (ADR-002 §3); deliberately-shared content audio may persist, on-device, opt-in. A meeting contains both kinds at once. | adr-002-phase-2-voice-architecture-on-device-web-speech §3; adr-006 §4 |
| web | Azure continuous LID "doesn't support changing languages within the same sentence"; candidates capped at 4 (at-start) / 10 (continuous). | https://learn.microsoft.com/nb-no/azure/ai-services/Speech-Service/language-identification |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 7 | Butter stated the driver first-hand | frequency, duration, what the evidence is used for |
| 2 | Scope & boundary | 4 | only my proposed phase order; nothing marked out | an explicit in/out list, agreed |
| 3 | Technical contract | 6 | capture path, artifact writer, loopback handler read on disk | read /capture + GET /artifacts bodies; settle audio upload shape (~55 MB/hour, base64 +33%) |
| 4 | Prior art & constraints | 8 | ADR-006 proven pattern; ADR-002 §3 privacy precedent | confirm choda-deck has no ADR governing cloud audio |
| 5 | Edges & failure | 3 | nothing gathered | 5 gap lenses over record -> transcribe -> summarise |
| 6 | NFR | 2 | checklist not walked | 12 categories, esp. security/cost/retention |
| 7 | Acceptance criteria | 1 | none written | blocked on #3 and #5 |

**TOTAL = MIN = 1** (dimension 7)
Previous round: 1 -> this round: 1. New evidence? YES (8 sources) -> may continue.

### Score history
| # | Dimension | R1 |
|---|---|---|
| 1 | Problem & value | 7 |
| 2 | Scope & boundary | 4 |
| 3 | Technical contract | 6 |
| 4 | Prior art | 8 |
| 5 | Edges & failure | 3 |
| 6 | NFR | 2 |
| 7 | Acceptance criteria | 1 |
| | **MIN** | **1** |

### Round 2 will look for exactly this
- 5 gap lenses over the pipeline (#5)
- NFR checklist, esp. retention + client-audio security (#6)
- /capture contract + GET /artifacts route; upload shape for ~55 MB (#3)
- Confirm no choda-deck ADR governs cloud audio (#4)

## Round 2 — meeting recorder + bilingual transcription

thread: no new messages

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| conversation | nothing new — Butter has not posted yet | CONV-1789453938305-1 |
| code | The existing upload path CANNOT carry the audio. /capture caps at CAPTURE_MAX_IMAGE_BYTES = 5 MB (413 above); other write routes cap at 64 KB / 2 MB. A 1-hour Opus file is ~55 MB at ADR-006's measured 0.92 MB/min. | capture-contract.ts:104; http-server.ts:443; atomic-file.ts:20; ac-review.ts:29 |
| code | choda-deck already calls Azure and stores an Azure key — AI Foundry is a selectable review provider (ai-key.txt, ai-provider.json). Summarisation is a reuse; text egress to Azure is already accepted. | azure-review.ts:1-27 |
| code | Chunked capture is the proven shape: ADR-006's recorder uses timesliceMs for crash-flush, which maps onto a chunked upload rather than one 55 MB POST. | adr-006 §1 |
| knowledge | No choda-deck ADR governs audio capture or audio egress; both audio ADRs belong to english-companion. No precedent in THIS project. | knowledge_search (8 hits, 0 choda-deck audio entries) |

### Edges walked (5 lenses)
- Negative: crash / sleep mid-meeting loses everything without chunked flush. Mic granted but loopback denied -> you record only yourself, unnoticed until playback.
- Actor: the remote party is not a user of this app and never consents inside it.
- Time: a 3-hour meeting is ~165 MB; cost and latency scale with duration; recordings accumulate.
- Integration boundary: Azure down / key expired / quota hit — the recording must survive and transcription must be RE-RUNNABLE from stored audio.
- Data lifecycle: nothing deletes a recording today.

### NFR (12/12)
| Category | Requirement | Source |
|---|---|---|
| Performance | no dropped audio while recording; transcription batch, minutes acceptable | Assumed |
| Scalability | single user, few meetings/day | Assumed |
| Availability | no SLA; recording must work with Azure unreachable | Assumed |
| Security | client audio is sensitive; key already file-based; credentials to sensitive_information/ | azure-review.ts:26; CLAUDE.md |
| Observability | visible recording indicator; per-meeting status recorded/transcribed/summarised | Assumed |
| Error handling | chunked flush; retryable transcription; never silently discard a recording | Derived |
| Data | RETENTION UNDECIDED — must not default. ADR-006 precedent: 50-item cap | ADR-006 §3 — needs Butter |
| i18n | audio VI+EN; note written in English, Vietnamese quoted verbatim | CLAUDE.md |
| Accessibility | not required for v1 | Default |
| Compliance | recording a client without notice — not legal everywhere | needs Butter |
| Maintainability | spans companion + adapter (two repos) | main.cjs; http-server.ts |
| Integration | Azure Speech (new), Azure AI Foundry (existing), chunked upload route (new) | azure-review.ts |

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 7 | Butter first-hand; no new evidence this round | frequency, duration, use of the evidence |
| 2 | Scope & boundary | 4 | no new evidence; nothing marked out | Butter's in/out call |
| 3 | Technical contract | 8 | write path, caps, loopback handler, no-preload read on disk | engine choice changes the contract |
| 4 | Prior art & constraints | 9 | azure-review.ts:1-27; ADR-006/002; no choda-deck ADR forbids it | — |
| 5 | Edges & failure | 7 | 5 lenses walked against real constraints | engine-specific failure modes |
| 6 | NFR | 9 | 12/12, 2 flagged as Butter's call rather than defaulted | — |
| 7 | Acceptance criteria | 5 | writable for phase 1, but scope not approved | agreed scope (#2) |

**TOTAL = MIN = 4** (dimension 2)
Previous round: 1 -> this round: 4. New evidence? YES (4 sources) -> may continue.

### Score history
| # | Dimension | R1 | R2 |
|---|---|---|---|
| 1 | Problem & value | 7 | 7 |
| 2 | Scope & boundary | 4 | 4 |
| 3 | Technical contract | 6 | 8 |
| 4 | Prior art | 8 | 9 |
| 5 | Edges & failure | 3 | 7 |
| 6 | NFR | 2 | 9 |
| 7 | Acceptance criteria | 1 | 5 |
| | **MIN** | **1** | **4** |

### STOPPED — blocked on a human decision (§5)
Dimensions 2 (and 1, and downstream 7) cannot be raised by searching. Four decisions
are Butter's and no amount of grepping produces them:

1. Scope of v1 — record-only first, or record+transcribe+summarise in one go?
2. STT engine — Azure (cited intra-sentence code-switch limitation) vs local Whisper
   (english-companion already ships the ~145 MB model and the pattern) vs decide by a
   measured bake-off on one real meeting.
3. May client audio leave the laptop? Text already does (azure-review.ts); audio is a
   new class of egress with no precedent in this project.
4. Retention — how long recordings are kept, and what deletes them.

status: min-8-pending-approval

---

## Round 3 — meeting recorder (v1 = record only)

Butter answered the four blocking decisions; the loop resumed.

### New evidence this round
| Source | What it settled | Citation |
|---|---|---|
| conversation | Butter, 4 decisions: v1 = RECORD ONLY; engine = Azure Speech (v2); client audio MAY leave the laptop; retention = keep N most recent. | CONV-1789453938305-1 |
| code | The renderer needs no auth work — the static proxy already injects x-choda-bridge-token on /api/*. A new token-gated byte route is reachable with zero token handling in the web app. | artifacts.ts:1-9 |
| code | GET /artifacts/<relPath> serves from a fixed MIME map with NO audio type — .webm/.opus would be an opaque download, not playable by <audio>. | artifacts.ts:22-34 |
| code | Traversal refused on the RAW url; token compared with timingSafeEqual. A meeting-audio route must reuse this shape, not invent a second byte route. | artifacts.ts:42-59 |

With v1 record-only, the STT engine no longer touches v1's surface. Azure + audio
egress become v2 decisions, recorded now, blocking nothing.

### Scores
| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem & value | 9 | Butter first-hand; record-only confirms the recording IS the value | — |
| 2 | Scope & boundary | 9 | IN: loopback+mic capture, chunked persist, playback, retention cap. OUT: transcription, summary, diarization, live captions, non-Windows | — |
| 3 | Technical contract | 8 | main.cjs:79-86; main.cjs:179-184; artifacts.ts:1-9,22-59; capture-contract.ts:104 | audio:'loopback' documented (Electron 31+) but NOT RUN on this machine |
| 4 | Prior art & constraints | 9 | azure-review.ts:1-27; ADR-006 (0.92 MB/min); ADR-002 §3 | — |
| 5 | Edges & failure | 9 | 5 lenses walked; every v1 failure has a named behaviour | — |
| 6 | NFR | 9 | 12/12; retention + egress decided, not defaulted | — |
| 7 | Acceptance criteria | 9 | each names a surface and can fail | — |

**TOTAL = MIN = 8** (dimension 3)
Previous round: 4 -> this round: 8. New evidence? YES (4 sources) -> may continue.

### Score history
| # | Dimension | R1 | R2 | R3 |
|---|---|---|---|---|
| 1 | Problem & value | 7 | 7 | 9 |
| 2 | Scope & boundary | 4 | 4 | 9 |
| 3 | Technical contract | 6 | 8 | 8 |
| 4 | Prior art | 8 | 9 | 9 |
| 5 | Edges & failure | 3 | 7 | 9 |
| 6 | NFR | 2 | 9 | 9 |
| 7 | Acceptance criteria | 1 | 5 | 9 |
| | **MIN** | **1** | **4** | **8** |

Dimension 3 is deliberately NOT awarded 9: that audio:'loopback' actually yields the
remote party's voice in this Electron build on this machine is documented but unrun.
Per the rubric that is a 7-8. It converts into AC-1 as a proof script, the way ADR-006
closed its equivalent gap with proof-1231.mjs.

### Decisions recorded for v2 (not v1 scope)
- STT engine: Azure Speech. Known limitation, cited: continuous LID does not switch
  language within a sentence — exactly the VI/EN mixing case. Mitigation to evaluate
  when v2 starts: per-track transcription (your mic track vs the loopback track are
  separate streams in v1 already), and a measured comparison against local Whisper.
- Client audio MAY leave the laptop. No choda-deck ADR covers audio egress; one should
  be written when v2 starts.
- Retention: keep N most recent. N not specified — ASSUMED 20 (~1.1 GB at 55 MB/hour).

status: stopped-at-min-8-pending-approval
