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

```sh
pnpm --filter server start
```

```sh
curl http://127.0.0.1:8080/api/health
# {"ok":true}

curl http://127.0.0.1:8080/api/queue
# [{"id":"queue-...","taskCount":1,"totalCostUsd":0.22,...}]

curl http://127.0.0.1:8080/api/queue/queue-1778471338165-1qtq
# {"report":"# Queue run...", "meta":{...}}

curl "http://127.0.0.1:8080/api/tasks?status=READY,IN-PROGRESS"
# [{...},{...}]

curl http://127.0.0.1:8080/api/tasks/TASK-703
# {...} or 404
```

## Token auth (LAN mode)

When `--bind 0.0.0.0`, a token is auto-generated and printed once at startup. Pass it via:

```sh
curl -H "Authorization: Bearer <token>" http://<host>:8080/api/queue
# or
curl "http://<host>:8080/api/queue?token=<token>"
```
