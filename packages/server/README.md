# server

Hono HTTP server exposing read-only routes against choda-deck artifacts dir + SQLite.

## Start

```sh
pnpm --filter server start
```

Default: `http://127.0.0.1:8080`

## CLI flags

| Flag | Default | Env |
|---|---|---|
| `--port` | `8080` | — |
| `--bind` | `127.0.0.1` | — |
| `--token` | auto-gen 32-char base58 when `--bind 0.0.0.0` | — |
| `--artifacts-dir` | `C:\dev\choda-deck\data\artifacts` | `CHODA_ARTIFACTS_DIR` |
| `--db-path` | `C:\dev\choda-deck\data\database\choda-deck.db` | `CHODA_DB_PATH` |

## Manual smoke

Start the server (long-running; Ctrl-C to stop):

```sh
pnpm --filter server start
```

Then verify each view:

1. **Root redirect** — open `http://127.0.0.1:8080/` in a browser; should redirect to `/static/index.html#/queue`.

2. **Queue list** — navigate to `#/queue`. Rows should appear (status icon + monospace id + cost + tasks count + relative time + chevron). If no queue runs exist, shows "No queue runs yet."

3. **Queue detail drill** — click a queue row → navigates to `#/queue/<id>`. Markdown report renders (headings, tables, code blocks). Back link returns to queue list. Browser back/forward buttons work.

4. **Tasks tab** — click "Tasks" tab → navigates to `#/tasks`. Filter chips (in progress, ready, todo, failed) appear at top. Task rows show (status icon + TASK-id + title truncated at 60 chars + labels + priority dot + relative time + chevron). Default hides DONE/CANCELLED.

5. **Filter chip toggle** — click "done" chip to add it to the filter; click again to remove. URL updates to reflect active statuses (`#/tasks?status=...`).

6. **Task detail drill** — click a task row → navigates to `#/tasks/<id>`. Markdown body renders. Checkboxes render as readonly text. Back link returns to tasks list.

7. **Mobile responsive** — open DevTools → set device to iPhone 12 preset (390×844). Rows remain readable; tabs stay in header; no horizontal overflow.

8. **Dark/light theme** — switch OS appearance between light and dark. Page colors switch automatically (no manual toggle).

9. **API health check** (curl):

```sh
curl http://127.0.0.1:8080/api/health
# {"ok":true}

curl http://127.0.0.1:8080/api/queue
# [{"id":"queue-...","taskCount":1,"totalCostUsd":0.22,...}]

curl "http://127.0.0.1:8080/api/tasks?status=READY,IN-PROGRESS"
# [{...},{...}]
```

10. **SSE live indicator** — with the server running and a Chrome tab open at `/static/index.html#/queue`, kick a real queue in a separate terminal (queue must run against `--workspace main` or another choda-deck-tracked workspace):

```sh
node C:\dev\choda-deck\dist\cli.cjs queue start --workspace main --max-tasks 1
```

Watch the browser:
- Title flips to `(1) Companion · Queue` within ~1 second of `run.active`.
- An expanded blue-bordered row appears at the top of the Queue tab with the active `queueRunId`, accumulated cost ticker, elapsed duration.
- Per-task rows append inside the card as `task.started` / `task.finished` events arrive.
- On `run.finished` (or `run.failed`) the card collapses out and the full Queue list refreshes; title returns to `Companion · Queue`.
- DevTools → Network panel shows exactly **one** long-running `EventStream` connection to `/api/queue/live` (no rapid retry rows).

Edge: if no queue is active when the browser connects, only periodic `: keep-alive` comment lines flow on the SSE stream — no `run.active` event. When you then kick a queue, the client picks it up on the next reconnect cycle (EventSource auto-retries on stream close).

## Token auth (LAN mode)

When `--bind 0.0.0.0`, a token is auto-generated and printed once at startup. Pass it via:

```sh
curl -H "Authorization: Bearer <token>" http://<host>:8080/api/queue
# or
curl "http://<host>:8080/api/queue?token=<token>"
```
