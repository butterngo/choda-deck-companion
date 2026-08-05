# TASK-1569 — AC verification

**Task:** Companion web: capture-aware markdown renderer (artifact refs → /api/artifacts)
**Verified:** 2026-08-05 · session SESSION-1785908876632-41 · merge commit `efcd945` (PR #46)
**Result: 8/9 verified · 1 needs a human · 0 blocked**
**Task held at IMPLEMENTED — not DONE — because of the unticked criterion.**

## Per-criterion

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | relative ref → `/api/artifacts/...` | ✅ | `capture-refs.test.ts` AC-1 |
| 2 | legacy Windows absolute → same URL | ✅ | resolver AC-2 **and** render AC-2 (see finding) |
| 3 | legacy POSIX absolute → same URL | ✅ | `capture-refs.test.ts` AC-3 |
| 4 | non-capture refs pass through byte-identical | ✅ | 6 cases incl. an external URL containing `captures/` |
| 5 | `.har`/`.json`/`.jsonl`/`.md` → anchor, never `<img>` | ✅ | `CaptureMarkdown.test.tsx` AC-5 ×2 |
| 6 | `.png`/`.jpg`/`.webp` → `<img>` with rewritten src | ✅ | `CaptureMarkdown.test.tsx` AC-6 |
| 7 | `TaskDetailPanel` renders via the component, `<pre>` gone | ✅ | `git show efcd945` |
| 8 | `KnowledgeDetail` renders via the component | ✅ | bare `<Markdown>` import removed; its 3 existing tests still pass |
| 9 | **screenshot displays inline in the running companion** | ⬜ **NOT VERIFIED — needs a human** | carried forward as TASK-1573 |

## The finding

**Legacy absolute paths must be normalized before the markdown is parsed, not after — and a
resolver-only test suite would have shipped this broken.**

The first implementation resolved refs inside a `components.img` override. Its unit test
passed on the legacy Windows path. The *render* test on the same path failed with
`src` = undefined.

Cause: CommonMark treats a backslash in a link destination as an escape character. A body
captured before TASK-1567 —

```
![capture](C:\dev\choda-deck\data\artifacts\captures\ab12.png)
```

— parses to an image node with **no url at all**. There is nothing for a component override
to resolve; the information is gone before any of my code runs.

Fixed with `normalizeCaptureBody()`, applied to the markdown string before `<Markdown>`
sees it. Worth recording because the two tests disagreed: the unit test was green and the
feature was broken, and only asserting on rendered output caught it.

## Deliberately not ticked

AC-9 requires the Electron app running against a real data dir with a real capture, and a
person looking at the screen. This runner has no human in the loop, so ticking it on test
output would convert an unrun check into an invisible one. Filed as **TASK-1573**, which
also carries TASK-1570's equivalent criterion and adds two cases worth checking at the same
time (a pre-TASK-1567 entry, and a `.har` download).

What *is* proven, from `task-1568-ac-verification.md`: the full data path
capture → conversation → relative path → artifact bytes returns a real 70-byte PNG over
HTTP. The gap is strictly the rendered pixel.

## Gates

| Gate | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `pnpm run test` | 23 files / 103 passed (22 new) |
| `pnpm run lint` | clean |
| `pnpm run build` | clean |
| CI | **none configured on this repo** — local gates were the only signal |
| Merge proof | `efcd945` is an ancestor of `origin/main` |
