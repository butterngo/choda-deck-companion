---
type: gotcha
title: A junction makes another process's log look like yours — check the reparse point before attributing a crash
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: electron/adapter-launcher.cjs
    commitSha: 4ce2b89fdb5ebf1dc70daa44d05224651a7735c5
createdAt: 2026-08-24
lastVerifiedAt: 2026-08-24
---

## Trigger

You are reading a log under an app's own data directory (`%APPDATA%\<app>`, `~/.config/<app>`) and attributing what you find there to that app. Especially when the log says something is crashing and you already suspect that app.

## Context

TASK-1590 was filed as *"Electron companion never binds 7338 — adapter host dies with 0xC000042B"*, high priority, marked `blocker`. It blocked a release and got three separate browser-verification passes skipped (TASK-1608, TASK-1597, INBOX-1772). It survived three weeks.

Every load-bearing fact in it was wrong, and two of them were wrong because of a **filesystem junction**:

`%APPDATA%\choda-deck-companion\data` is a reparse point targeting `C:\dev\choda-deck\data`. So `%APPDATA%\choda-deck-companion\data\logs\companion-server.log` — which reads unambiguously as *the Electron app's own log* — is actually the **legacy Task Scheduler service's** log. The crash history in it belonged to a completely different process, launched by a different mechanism, from a different repo.

The tell was there and was misread: the log's own lines said `db: C:\dev\choda-deck\data\database\choda-deck.db`, a path with no business appearing in a packaged app's userData log. That anomaly was noticed and explained away instead of pulled on.

## Business rule

**A path under an app's data directory is not evidence about that app until you have checked whether it is a link.** On Windows a junction is invisible to `Test-Path`, `Get-Content`, `dir`, and every path-based API — it behaves exactly like a real directory. Nothing in the reading experience distinguishes "this app's log" from "someone else's log, reached through a link in this app's folder".

The corollary that actually cost the time: **attribute a log line to its emitter, not to its location.** Grepping the emitting string across both repos took one command and settled the question in seconds — `[launcher] server exited … restarting in 15s` occurs in exactly two places, both in choda-deck (`scripts/install-companion-service.mjs` and its generated `.cmd`), and zero times in the companion repo. That check was available on day one.

## Resolution

Before attributing anything found under an app's data dir:

```powershell
$i = Get-Item $dir -Force
$i.Attributes   # look for ReparsePoint
$i.Target       # where it actually goes
```

And attribute by emitter, not by path:

```bash
grep -rn "<the exact log string>" <every repo that could plausibly write it>
```

If the string has one emitter, you are done — no amount of "but the file is in the app's folder" outweighs it. If it has none in the repo you suspect, you have your answer.

Generalised: **the file's location tells you where bytes were read from, never who wrote them.** Same failure family as `textcontent-is-not-the-code` and the confidently-wrong capture provenance of TASK-1549/1551 — a plausible source attribution that no one checks because it looks authoritative.

## Related

- `registered-to-auto-start-is-not-serving-prove-which-path-owns-the-port` — carries the full correction of the TASK-1590 misdiagnosis; the port half of the same error
- The 0xC000042B crash itself belongs to the legacy launcher and remains undiagnosed; TASK-1442 deletes that launcher
