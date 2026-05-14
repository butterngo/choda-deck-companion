> **Source**: `choda-deck/docs/knowledge/companion-ui-system.md`. Update upstream first, copy here.
> **Last synced**: 2026-05-14 (initial copy)

# Companion UI Design System

## Purpose

Standardize tất cả UI/UX decisions cho `choda-deck-companion` (web client trên top of choda-deck core, mobile + desktop browser). Future implementations (Phase 2 viewer, Phase 3 PWA write, additional tabs nếu add sau) **MUST** follow conventions ở doc này để remain consistent.

Source of truth: design discussion 2026-05-14 giữa Butter (human) + Claude (design role). Quyết định downstream từ CONV-1778726114825-1 (closed) và INBOX-243 (Phase 2 spec).

Future Claude in design role: đọc full doc trước khi design new component cho companion. Reuse existing patterns, không tự ý introduce mới trừ khi consult qua discussion conv.

## Identity — what companion IS

- **Thin client** trên top of choda-deck core. Consume filesystem artifacts, SQLite readonly, `queue.jsonl` stream. KHÔNG own data, KHÔNG write SQLite directly.
- **Single-user, single-machine** tool. No auth model (token = LAN gate, không identity), no onboarding, no help-text overlay.
- **Cross-platform, same codebase**: desktop browser + phone browser → cùng HTML/CSS/JS. Top tabs cả hai platform. KHÔNG bottom-nav-mobile + top-tabs-desktop split.
- **Read-only Phase 2, write Phase 3**: write happens via CLI shell-out (`choda-deck task update ...`), KHÔNG via direct SQLite mutation hoặc long-lived MCP client.
- **CLI-consistent**: render `report.md` markdown raw via `marked.js`, NOT structured UI parse-from-source. `cat report.md` và browser detail = cùng content.
- **Pragmatic Polish ambition**: Tailwind CDN, system font stack, auto dark/light via CSS variables. KHÔNG custom illustration, KHÔNG animation library.

## Identity — what companion IS NOT

- KHÔNG SaaS multi-user product
- KHÔNG breach ADR-008 (repo riêng `choda-deck-companion`, sibling với core)
- KHÔNG responsive split-style (mobile vs desktop = different layouts)
- KHÔNG dashboard with cost trend chart (Phase 2; reconsider sau khi có usage data)
- KHÔNG emoji decoration (ntfy notification cũng text-only, no tags)
- KHÔNG fancy micro-animation cho status change
- KHÔNG build step (no webpack, vite, esbuild — straight HTML/JS served by Hono)

## Design tokens

### Typography

- Body font stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- Mono font stack (cho task IDs, queue IDs, cost, file paths): `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace`
- Size scale: 12px (meta) / 14px (body) / 16px (h3) / 18px (h2) / 22px (h1). Cap 22px — không có giant hero text.
- Weight: 400 regular, 500 bold. NEVER 600 hoặc 700 (looks heavy).
- Case: **sentence case** everywhere. Never Title Case, never ALL CAPS.

### Color approach

Defer to Tailwind default palette + CSS variables for theme.

Semantic mapping:
- success / done: `text-green-600` (light) / `text-green-400` (dark)
- in-progress: `text-blue-600` / `text-blue-400`
- waiting / queued: `text-zinc-500`
- failed / danger: `text-red-600` / `text-red-400`
- cancelled / muted: `text-zinc-400`

Background:
- Page: `bg-white` (light) / `bg-zinc-900` (dark)
- Surface (cards, expanded row): `bg-zinc-50` / `bg-zinc-800`

Border: `0.5px solid` `zinc-200` / `zinc-700`.

Auto switch via `prefers-color-scheme` media query — KHÔNG có manual toggle.

### Spacing

- Page padding: 16px outer (mobile) / 24px (desktop ≥768px breakpoint)
- Component gap: 8px (tight) / 12px (default) / 16px (section break)
- List row vertical padding: 12px
- Tab strip height: 48px

### Radius

- Component (button, input): `rounded-md` (6px)
- Pill / chip / badge: `rounded-full` (9999px)
- Card / expanded surface: `rounded-lg` (8px)

## Iconography catalog

ALWAYS Tabler outline (`<i class="ti ti-NAME">`), NEVER `-filled` suffix. Decorative icons get `aria-hidden="true"`.

| State | Icon name | Default color |
|---|---|---|
| TODO / queued | `ti-clock` | zinc-500 |
| READY | `ti-check` | zinc-500 |
| IN-PROGRESS / running | `ti-player-play` | blue-600 |
| DONE / finished | `ti-check` | green-600 |
| CANCELLED | `ti-x` | zinc-400 |
| FAILED | `ti-x` | red-600 |
| Active live indicator | green dot 8px (no icon) | green-500 |
| Refresh / reload | `ti-refresh` | zinc-500 |
| Drill-into-detail | `ti-chevron-right` | zinc-400 |
| Tab — Queue | `ti-list` | inherit |
| Tab — Tasks | `ti-checklist` | inherit |
| Tab — Inbox (future) | `ti-inbox` | inherit |
| Tab — Knowledge (future) | `ti-book` | inherit |

## Component catalog

### List row (queue, tasks)

Pattern:
```
[STATUS-ICON] [PRIMARY-ID-mono] [TITLE-truncate]  [META...]  [TIME-relative]  [>]
```

- Status icon 16px
- Primary ID monospace, e.g., `queue-1778728` hoặc `TASK-735`
- Title truncate at 60 chars (ellipsis)
- Meta area = labels (max 2 + "+N"), priority dot, cost, duration depending on entity
- Time = relative format (xem dưới)
- Trailing `ti-chevron-right` nếu clickable (drill into detail)
- Padding 12px vertical, 16px horizontal
- Hover: subtle bg tint `bg-zinc-50` / `bg-zinc-800`
- Click: navigate hash route

### Label pill

- Background: `bg-zinc-100` / `bg-zinc-800`
- Text: `text-zinc-700` / `text-zinc-300`
- Padding: 2px 8px
- Font 12px regular
- Border-radius: full
- Max 2 visible inline; "+N" badge nếu nhiều hơn (vd `+3` cho 5 labels)

### Priority dot

- 6px solid circle, no border
- critical=red-500, high=amber-500, medium=zinc-400, low=blank (omit dot entirely)
- Position: meta area, after labels

### Relative time

Threshold table:

| Age | Format |
|---|---|
| <60s | `just now` |
| <60m | `Xm ago` |
| <24h | `Xh ago` |
| <2 days | `yesterday` |
| <7 days | `Xd ago` |
| ≥7 days | absolute `YYYY-MM-DD` |

### Detail markdown render

- Library: `marked.js` CDN (version pinned post Gate A)
- Apply Tailwind typography plugin classes (`prose prose-sm dark:prose-invert`)
- Code blocks preserved (no syntax highlight Phase 2; reconsider Phase 3+)
- Tables → native HTML `<table>`
- AC checkbox `- [ ] item` = readonly text (Phase 2). KHÔNG tappable.
- File pointers (paths in body) = display only Phase 2 (Phase 3 add copy-button)
- Sanitize: yes, escape HTML inside MD defensively

### Filter chip strip

- Position: top of list view, sticky after scroll
- Style: row of pills (label pill component), each toggleable
- Active state: solid background `bg-zinc-900` / `bg-zinc-100` + contrast text
- Inactive: standard label pill style
- Multi-select via tap, OR-semantics across chips

### Error display

Single-line text, no card wrap, terse functional tone.

| Failure | Display |
|---|---|
| Resource not found | `Cannot read <path>. <hint>.` |
| Empty (no entity) | `No <entity> yet.` (no CTA) |
| Filtered empty | `No <entity>. Adjust filters.` |
| Transient (DB busy) | `<system> busy. Retrying...` + auto-retry |
| SSE disconnect | Tiny `ti-refresh` spinner top-right, silent auto-retry 3s |
| Auth fail | `Invalid token. Check CLI output.` |
| Generic 500 | `Server error. See log.` + stack (dev mode only) |

KHÔNG: "Oops, something went wrong" / "We're sorry" / illustrations / retry button (auto-retry instead).

### Live indicator (cross-tab cue)

- Browser title prefix `(N) ` khi N ≥ 1 active runs
- Update via SSE `/api/queue/live` (Phase 2 gates pass) hoặc polling 2s fallback
- KHÔNG popup, KHÔNG toast, KHÔNG banner trong page

## Layout rules

### Tab strip

- Position: top, sticky after scroll
- Height: 48px
- Active tab style: `border-b-2 border-zinc-900 dark:border-zinc-100` + bold (500 weight)
- Inactive: `text-zinc-500`, no border
- Tab content: outline icon + label, gap 4px

### Content area

- Max-width: 1024px center
- Padding: 16px (mobile) / 24px (desktop ≥768px)
- No nested scrolling — page-level scroll only

### Hash routing

- All routes prefixed `#/`:
  - `#/queue` — queue list
  - `#/queue/<id>` — queue detail
  - `#/tasks` — tasks list (filter state via `#/tasks?status=READY,IN-PROGRESS`)
  - `#/tasks/<id>` — task detail
- Browser title updates per route: `[BADGE]Companion · <route-label>`
- Browser back/forward works via popstate

## Cross-phase invariants

Rules MUST hold across all phases (Phase 1 notifier, Phase 2 viewer, Phase 3 PWA, Phase 4+ Inbox/Knowledge):

1. **Thin client** — no direct SQLite write, no MCP client lifecycle coupling
2. **Repo separation** — companion sibling repo, NOT subfolder của choda-deck core
3. **No build step** — Vanilla JS + Tailwind CDN + marked.js CDN, served by Hono
4. **Sentence case + no emoji** — applies to all surfaces including push notification
5. **Auto dark/light** — every component MUST work in both modes (test mentally: "đen trên bg đen?")
6. **Bind 127.0.0.1 default** — LAN mode (`--bind 0.0.0.0`) opt-in only
7. **Token auth gate** — write endpoint (Phase 3+) NEVER without token verification
8. **Tabler outline icons only** — no `-filled` suffix, no emoji, no custom SVG art
9. **CLI-consistent render** — markdown as primary content presentation, not structured-parse
10. **Terse functional tone** — error messages + empty states + microcopy đều ngắn gọn, no apology, no fluff

## Phase 1 — Notifier microcopy (TASK-735)

### ntfy POST format (Brief variant chốt 2026-05-14)

- **Title finished**: `Done · <N> tasks`
- **Title failed (có failedTaskIndex)**: `Failed · task <i> of <N>` (1-based)
- **Title failed (fallback)**: `Failed · <N> tasks`
- **Body**: `$<costFormatted> · <durationFormatted> · <queueRunId>`
  - `costFormatted` = 2 decimal places, e.g. `$0.42`
  - `durationFormatted` = `Xm YYs` khi ≥60s (YY zero-padded) hoặc `Ys` khi <60s
- **Priority header**: `3` finished (silent chirp) / `4` failed (vibrate + sound)
- **Tags header**: empty array (text-only, no emoji prefix)
- **Click header**: empty Phase 1; set viewer URL Phase 2+

### Internal payload (no PII)

```ts
{
  status: "finished" | "failed",
  queueRunId: string,
  taskCount: number,
  totalCostUsd: number,
  durationMs: number,
  failedTaskIndex?: number  // 1-based INDEX, NEVER task title
}
```

NEVER include: task title, diff content, AC text, prompt text.

## Phase 2 — Viewer (Queue + Tasks read-only, INBOX-243)

### Scope

- 2 tabs: Queue + Tasks
- Read-only (all writes deferred Phase 3)
- Inbox + Knowledge tabs DROPPED (defer Phase 4+ if pain confirmed)

### Server endpoints (Hono)

| Route | Behavior |
|---|---|
| `GET /` | Redirect `/queue` |
| `GET /static/index.html` | Serve PWA shell |
| `GET /api/queue` | List queue runs via fs scan `data/artifacts/queue-*/` |
| `GET /api/queue/:id` | Return `report.md` content + `queue-run.json` meta |
| `GET /api/queue/live` | SSE tail `queue.jsonl` (newest active run) |
| `GET /api/tasks?status=...` | List tasks SQLite readonly with status filter (OR-semantics multi-value) |
| `GET /api/tasks/:id` | Single task body + meta |
| `GET /api/health` | Liveness check (200 OK) |

### Queue tab

- Unified list, sorted recency desc (newest first)
- Active run row (status=running) expanded inline ở top, showing:
  - Per-task progress với status icon
  - Cost ticker accumulated
  - Duration elapsed
- Past run rows collapsed using list-row pattern
- Click row → drill `#/queue/<id>` (markdown render report.md)

### Tasks tab

- List row using component catalog spec
- Sort: group by status (IN-PROGRESS → READY → TODO → DONE → CANCELLED), within group priority desc → updatedAt desc
- Filter chip strip top, multi-select toggle
- **Default: hide DONE + CANCELLED** (focus on active work)
- Click row → drill `#/tasks/<id>` (markdown render task body)
- AC checkbox readonly (consistent với Phase 2 read-only scope)

### Gates trước impl

- **Gate A**: `marked.js` fixture render của `data/artifacts/queue-1778471338165-1qtq/report.md` — pass criteria: HTML tables + code blocks + tree listing all render correctly, heading hierarchy intact
- **Gate B**: Hono SSE Windows Node smoke — 100 events / 5 phút / 1 browser client / no disconnect / no buffer issues

Both parallel ~1h total wall-clock. Fail handling:
- Gate A fail → spike alternative `markdown-it` hoặc `showdown`
- Gate B fail → fall back polling `/api/queue/live` every 2s

## Phase 3 — PWA + write endpoints

### Write path architecture

- Server spawns `choda-deck task update ...` (CLI shell-out) per write request
- ~200ms overhead acceptable (human-triggered, low frequency)
- KHÔNG persistent MCP client process
- KHÔNG direct SQLite mutation
- Each write = isolated audit log entry

### PWA shell

- Service worker: offline shell + cache static assets (HTML + JS + Tailwind CDN copy + marked.js CDN copy)
- Manifest: name="Companion · choda-deck", theme-color auto từ `prefers-color-scheme`
- "Add to Home Screen": tested Android Chrome + iOS Safari
- Splash screen: minimal (logo text "Companion" mono font)

### Write UX patterns

- **Confirm dialog** cho destructive actions (archive task, delete inbox, cancel queue) — full-screen modal, plain text question + 2 buttons (cancel default, action danger color)
- **Optimistic update vs wait-for-ack**: lean **wait-for-ack** vì writes infrequent + server <500ms typical
- **Loading state on write button**: button text changes to "Saving..." with spinner, disabled khi inflight

### Auth UX

- Token gate on every write endpoint
- Token shown 1 lần ở CLI khi server start với `--bind 0.0.0.0` flag
- User enters token once in mobile, persisted via `localStorage` (NOT sessionStorage — survive browser restart)
- Token rotation = restart server với new `--token` flag, mobile prompt re-enter

## Deferred — Inbox + Knowledge tabs

Decision 2026-05-14: drop khỏi Phase 2 hoàn toàn. Trigger conditions to revisit:

- Inbox triage from phone becomes recurring pain (mention 3+ times trong 1 tuần usage)
- Knowledge search from phone becomes recurring pain
- Companion feels "incomplete" without these tabs (subjective signal)

Khi revisit, IA cho phép extension: tab strip extends from 2 to 3 hoặc 4, no architecture change. Decisions vẫn applicable:
- Read-only for first pass
- List + detail markdown render (cùng pattern Queue/Tasks)
- Filter chip strip pattern parallel Tasks tab
- Status icon mapping extends for inbox states (raw/researching/ready/converted/archived)

## References

- **CONV-1778726114825-1** (closed) — companion design decision source
- **INBOX-243** (raw) — Phase 2 spec (Queue + Tasks viewer)
- **TASK-735** (DONE) — Phase 1 notifier impl
- **INBOX-239** (converted → TASK-735) — companion unified design background
- **INBOX-216** (archived), **INBOX-231** (archived) — superseded by INBOX-239
- **ADR-008** — choda-deck core "no UI" identity statement (companion KHÔNG breach vì repo riêng)
- **ADR-019** — queue.jsonl event schema (Phase 1 consume, Phase 2 SSE)
- **TASK-726** (DONE) — `renderQueueReport()` output → Phase 2 markdown source
- **TASK-728** (DONE) — `queue start` worktree + queue.jsonl writer

## Maintenance

This doc là **authoritative** cho UI/UX decisions của companion. Khi có new UI surface (e.g., Phase 3 write screen design, future Inbox tab implementation, error state mới chưa được map), implementer phải:

1. Đọc full doc trước khi design new component
2. Reuse existing patterns từ component catalog
3. KHÔNG introduce new pattern không có ở doc trừ khi consult discussion conv (mở conv mới với type=proposal, decided trước khi update doc)
4. New decision approved → update upstream `choda-deck/docs/knowledge/companion-ui-system.md` first, copy here
5. Open phase decisions (Phase 3 confirm dialog wording, future Inbox tab list row variations) gets new section khi mature

### Update history

- 2026-05-14: Initial creation. Captures decisions from CONV-1778726114825-1 + design discussion 2026-05-14 (Butter human + Claude design role). Covers Phase 1 microcopy + Phase 2 full spec + Phase 3 sketches + deferred phases identity rules.
