# choda-deck-companion

Thin clients on top of the choda-deck core's filesystem artifacts. The core
stays untouched; this repo only **reads** `queue.jsonl` per [ADR-019] and pushes
to external surfaces (ntfy, browser, …).

[ADR-019]: ../choda-deck/docs/knowledge/ADR-019-autonomous-queue-runner.md

## Status

| Phase | Surface | Status |
| --- | --- | --- |
| 1 | `packages/notifier/` — ntfy.sh push on queue completion | shipped |
| 2 | HTTP server + minimal viewer + SSE | gated on Phase 1 usage data |
| 3 | PWA shell + write endpoints via CLI shell-out | gated on Phase 2 |

## Phase 1 — ntfy notifier

Long-running watcher that tails `<artifactsDir>/queue-*/queue.jsonl`, detects
`run.finished` / `run.failed` events (ADR-019 schema), and POSTs a **minimal**
payload to `<ntfyHost>/<topic>`.

### Install & run

```pwsh
pnpm install
pnpm --filter notifier start
```

On first run the notifier auto-generates a 24-char base58 topic, prints a
subscribe URL to stdout, and persists it under
`~/.choda-deck-companion/notifier.json`. The same URL is reused on subsequent
runs — subscribe once on your phone.

Override the topic by exporting `NTFY_TOPIC`:

```pwsh
$env:NTFY_TOPIC = "my-private-topic-abc123"; pnpm --filter notifier start
```

Override the artifacts dir (default `C:\dev\choda-deck\data\artifacts`):

```pwsh
pnpm --filter notifier start -- --artifacts-dir C:\path\to\artifacts
# or
$env:CHODA_ARTIFACTS_DIR = "C:\path\to\artifacts"; pnpm --filter notifier start
```

### Subscribe on your phone

**Android.** Install [`ntfy`](https://ntfy.sh/) from F-Droid or Play Store.
Tap the `+` icon, enter the topic name shown at startup (e.g.
`Abc123DEFgh456JKLmnp789Q`), leave the server as `https://ntfy.sh`. Push
should arrive in <5 seconds of a queue finishing.

**iOS.** Open the subscribe URL (`https://ntfy.sh/<topic>`) in Safari and tap
*Share → Add to Home Screen* — that installs the ntfy PWA. Notifications work
once the page is open or the PWA is foregrounded; for true background push,
use the [ntfy iOS app](https://apps.apple.com/app/ntfy/id1625396347).

### What gets pushed (Brief format, locked 2026-05-14)

ntfy.sh topics are publicly addressable; short topics are discoverable by
guessing, so we treat the channel as untrusted. No task title, no diff, no AC
content, no prompt — only an action+count title and an aggregated body.

**Finished**

| Header   | Value                            |
| -------- | -------------------------------- |
| Title    | `Done · 5 tasks`                 |
| Priority | `3` (default — silent chirp)     |
| Body     | `$0.42 · 3m 12s · queue-abc123`  |

**Failed** (with known task index)

| Header   | Value                            |
| -------- | -------------------------------- |
| Title    | `Failed · task 3 of 5`           |
| Priority | `4` (high — vibrate + sound)     |
| Body     | `$0.18 · 47s · queue-abc123`     |

**Failed** (fallback, index unknown)

| Header   | Value                            |
| -------- | -------------------------------- |
| Title    | `Failed · 5 tasks`               |
| Priority | `4`                              |
| Body     | `$0.18 · 47s · queue-abc123`     |

`failedTaskIndex` is taken from the `run.failed` event when present, otherwise
derived from the count of `task.started` events seen earlier in the same
`queue.jsonl` stream. Tags and Click headers are intentionally **empty** in
Phase 1 — no emoji, no link (a viewer URL lands in Phase 2).

### Manual smoke test

While the notifier is running:

```pwsh
$dir = "C:\dev\choda-deck\data\artifacts\queue-smoke-$(Get-Random)"
New-Item -ItemType Directory -Path $dir | Out-Null
$payload = @{
  event="run.finished"; queueRunId="smoke-1"; taskCount=2;
  totalCostUsd=0.10; durationMs=1234
} | ConvertTo-Json -Compress
Set-Content -Path "$dir\queue.jsonl" -Value $payload -Encoding utf8
```

Within ~5 seconds your phone should buzz with a `finished` notification.

### Tests

```pwsh
pnpm test
pnpm lint
```

The integration test writes to a `tmpdir` `queue-*/queue.jsonl`, stubs the
push function, and asserts only `run.finished` / `run.failed` events trigger
a push and that no extra fields leak into the payload. Real ntfy.sh delivery
is *not* exercised in CI (network-dependent, brittle); use the manual smoke
above.

## Repository layout

```
choda-deck-companion/
├── package.json            workspace root
├── pnpm-workspace.yaml     declares packages/*
├── tsconfig.json           base TS config
├── eslint.config.js        flat eslint config
└── packages/
    └── notifier/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── cli.ts      entry — argv + topic + startNotifier
            ├── notifier.ts startNotifier(): watch + dispatch (stream state)
            ├── parser.ts   parseLine + numberOr
            ├── format.ts   buildTitle / buildBody / formatCost / formatDuration
            ├── ntfy.ts     pushNtfy with retry + backoff
            ├── topic.ts    base58 generation + persistence
            ├── types.ts    NotifyPayload, QueueEvent, …
            └── __tests__/  vitest specs
```

## Non-goals

This repo does **not** call MCP, touch SQLite, or import anything from
`choda-deck/`. Communication is one-way: filesystem read of `queue.jsonl`.
If you find yourself wanting bidirectional integration here, reconsider —
that belongs in core, behind ADR-008's boundary.
