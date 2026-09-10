# TASK-1938 — AC verification

**Release the diagram editor and prove a save touched only the fence**
Session SESSION-1789047860709-87 · companion 0.12.6
Verified 2026-09-10 by the `/choda-burn-backlog` runner (unattended).

**Result: 1 / 4 ticked. Three criteria are human and were NOT ticked. Task holds at IMPLEMENTED.**

## AC-1 (machine) — the vendored bundle carries the routes ✅

```
choda-deck/dist/companion-server.cjs                  10,729,085 bytes
release/win-unpacked/resources/adapter/...cjs         10,729,085 bytes
Buffer.compare === 0                                  BYTE-IDENTICAL
```

All four route strings present in the **packaged** bundle, not merely in the
source tree:

| string | in `resources/adapter/companion-server.cjs` |
|---|---|
| `/workspace-docs/diagram/check` | present |
| `/workspace-docs/diagram` | present |
| `if-match` | present |
| `etag` | present |

Built from `main` at `867df4b`, after `pnpm run build:companion` in the sibling
checkout — not from a bundle left over from an earlier run, which is the way this
check quietly passes against last week's code.

`verify-release-manifest`: `latest.yml matches package.json 0.12.6 and the
installer bytes on disk`.

## AC-2, AC-3, AC-4 (human) — NOT ticked

There is no human in this loop, so the only honest outcome is to leave them and
say what they need. None of the three can be faked from test output:

- **AC-2** — edit a diagram in the packaged app, save, then `git diff` in that
  repo: only the fence's lines may appear. This is the one that catches the
  line-ending and BOM defects, and a green suite cannot see either.
- **AC-3** — the same file open in two windows; the second save must be refused
  with "changed on disk" and the second window must still hold its text.
- **AC-4** — ask for a label containing `<`, `>` or `{{` and confirm the preview
  either draws it correctly or reports a 422. This is what proves the parse gate
  actually runs in the packaged build rather than only in tests.

## Two facts worth carrying elsewhere

1. **Installer: 201.2 MB** (`choda-companion-setup-0.12.6.exe`), against roughly
   196 MB before this feature. That is the number **TASK-1941** exists to weigh —
   the "bundled" half of its comparison is now measured rather than guessed. The
   10 MB adapter costs about 5 MB in the installer after compression.

2. **The installer is UNSIGNED.** `verify-signature` says so plainly: Windows
   SmartScreen will warn "Unknown publisher" and require *More info → Run
   anyway*. Pre-existing, not introduced here, but it is what Butter will meet
   when installing this build.

## Not done, deliberately

`pnpm run dist:publish` was **not** run. Publishing pushes the installer to the
GitHub release and the auto-update feed — outward-facing, hard to reverse, and
outside what the run's gates authorised (those covered merging PRs, not
publishing a release). The installer exists locally and is enough for the three
human criteria; whether it ships is Butter's call.
