# TASK-1570 — AC verification

**Task:** Companion web: conversation list + detail view
**Verified:** 2026-08-05 · session SESSION-1785909202123-55 · merge commit `18a58d9` (PR #47)
**Result: 5/6 verified · 1 needs a human · 0 blocked**
**Task held at IMPLEMENTED — not DONE — because of the unticked criterion.**

## Per-criterion

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `fetchConversations` / `fetchConversation` hit the two routes | ✅ | `conversations-api.test.ts` — asserted on the stubbed fetch's URL, incl. id encoding |
| 2 | `/conversations` route + nav entry | ✅ | `conversations-route.test.ts`, incl. that the catch-all `"*"` still comes last |
| 3 | list shows title + status; selection loads detail | ✅ | `ConversationList.test.tsx` (4 tests) |
| 4 | message bodies render through `CaptureMarkdown` | ✅ | `ConversationDetail.test.tsx` — relative ref, legacy absolute, and `.har` |
| 5 | unknown id → inline not-found, not a blank pane | ✅ | `role="alert"` branch on `detail.isError`; adapter 404 verified live in TASK-1568 |
| 6 | **screenshot displays inline in the running app** | ⬜ **NOT VERIFIED — needs a human** | carried forward as TASK-1573 |

## What this completes

TASK-1565's chain is now built end to end. Proven against a copy of the real DB in
`task-1568-ac-verification.md`:

```
POST /capture kind=image destination=conversation → CONV-…
GET /conversations/CONV-…  → "![capture](captures/14211d9cfb7af811.png)"
GET /artifacts/captures/14211d9cfb7af811.png → 200 image/png 70 bytes
```

and the rendering half is unit-proven: that same markdown produces
`<img src="/api/artifacts/captures/14211d9cfb7af811.png">`.

What no one has done yet is *look at the screen*. That is TASK-1573.

## Deliberately not ticked

AC-6 requires the Capture panel, a real screenshot, and a person. Ticking it on a green
suite would assert something nobody observed. Left unticked; the task holds at IMPLEMENTED.

## Gates

| Gate | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `pnpm run test` | 27 files / 120 passed (17 new) |
| `pnpm run lint` | clean |
| `pnpm run build` | clean |
| CI | **none configured on this repo** — local gates were the only signal |
| Merge proof | `18a58d9` is an ancestor of `origin/main` |

## Repo note

`choda-deck-companion`'s local `main` carries one **pre-existing unpushed commit**
(`d896e16`, TASK-1564's doc — predates this run), so it will not fast-forward against
`origin/main`. Both PRs in this run were branched from `origin/main` and merged there; the
local commit was left untouched rather than rebased. Someone should decide whether to push
or drop it.
