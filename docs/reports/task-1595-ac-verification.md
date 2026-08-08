# TASK-1595 — AC verification

**Task:** Web · sidebar shell + layout contract (drop the 1024px cap)
**Session:** SESSION-1786160209979-55
**PR:** [#53](https://github.com/butterngo/choda-deck-companion/pull/53) — squash-merged as `06a0f2f`
**Merge proof:** `git merge-base --is-ancestor 06a0f2f48fc0601e60a0fc0e10f9e5a823f940b0 origin/main` → ancestor ✅

**Result: 6/7 verified · 0 blocked · 1 needs a human.**

**Status: IMPLEMENTED, not DONE.** AC-7 cannot be proven by this runner.

## Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `maxWidth.page` gone, no `max-w-page` references | ✅ | `grep -rn "max-w-page"` over `src` + config returns nothing |
| 2 | `<nav>` with three groups, Knowledge a `button[aria-expanded]`, children out of the a11y tree when collapsed | ✅ | `queryByRole("link")` is **null** for both children after collapse — hidden-but-focusable would fail |
| 3 | Parent count rolls up from children | ✅ | Renders `{knowledge:2, vault:3}`, asserts parent shows `5` |
| 4 | Deep link to `/vault` expands and marks the parent active | ✅ | Renders at `/vault`, asserts `aria-expanded="true"`, then clicks to collapse and asserts it is **still** true |
| 5 | `StatusBar` inside the `<aside>`, not a sibling of `<main>` | ✅ | Asserts present within sidebar **and** absent within main — mere presence wouldn't distinguish the two |
| 6 | Shell owns scroll; no view viewport math added | ✅ | `<main …overflow-y-auto>` under `h-screen overflow-hidden`; `git diff` over `src/views` empty. **See the gap below** |
| 7 | Icon rail below 860px, no horizontal scroll at 800px | ⬜ **NOT TICKED** | Human-driven — see below |

## AC-7 is not ticked, and will not be by a runner

It requires resizing the actual Electron window and judging the result,
including against its real default size — which is the open question the design
note still carries about the 216px sidebar width. No human is in this loop, so
the only honest outcome is to leave it and name it.

**To close it:** run `pnpm --filter web dev`, resize below 860px and confirm the
sidebar becomes an icon rail, then at 800px confirm the page body never scrolls
sideways. Then tick AC-7 and move the task to DONE.

This is also the moment to judge the shell visually. TASK-1593 established that
**the gates cannot detect a visual regression** — all four stayed green through
a `borderRadius` change that would have shifted every corner in the app. This
PR changes what the app looks like; 146 passing tests say nothing about whether
it looks right.

## Known gap, recorded not hidden

Three views still carry TASK-1574's `calc(100vh)` clamps:

```
ConversationsView.tsx   max-h-[calc(100vh-14rem)]  ×2
KnowledgeView.tsx       max-h-[calc(100vh-18rem)], max-h-[calc(100vh-14rem)]
VaultView.tsx           max-h-[calc(100vh-18rem)], max-h-[calc(100vh-14rem)]
```

AC-6 is scoped to *files added by this task* (none), so it holds. But the Test
Plan's `rg "calc\(100vh" packages/web/src/views/` is broader and will not be
clean until TASK-1596 / 1602 / 1603 remove them. The epic-level AC on TASK-1592
tracks that, and the clamps are now redundant rather than harmful — the shell
owns scroll.

Removing them here was rejected: it is out of this task's scope, and each
removal needs its own visual check in the view that owns it.

## One pre-existing test repointed, not weakened

`conversations-route.test.ts > "Shell exposes a Conversations tab"` failed on
the full-suite gate. It greps `Shell.tsx` **source** for the old `TABS` array
literal (`to: "/conversations"`).

Traced before touching it: the nav entry still exists and `/conversations` is
still reachable — the declaration moved to `SidebarNav.tsx` as JSX. Behaviour
preserved; the test was coupled to the old declaration shape. It now reads that
file, with identical intent, and the rendered assertion in `Shell.test.tsx`
covers the same ground implementation-independently.

This is the one case in the epic so far where an existing test needed editing.
The rule is that a broken test signals a behaviour change and should stop the
work — it did stop the work, and the trace showed the behaviour was intact.

**`StatusBar`'s four tests passed untouched** through a complete layout rewrite,
because they assert text and `data-conn` rather than classes. That is the
presentation-only invariant working as designed.

## Design decisions

| Decision | Reasoning |
|---|---|
| Search keeps a control in the foot | The ⌘K palette that replaces it is a separate task; removing the tab first would make `/search` unreachable |
| Knowledge cannot be collapsed while you're inside it | Hiding the item highlighted as active reads as a bug. Also what makes a deep link land in an expanded section |
| Counts are optional props, none passed yet | Wiring real counts needs data plumbing, which a presentation-only task must not add. The component handles `undefined` by rendering no digits, asserted by test |
| `StatusBar` restyled vertically | It moved to a 216px column; a row of dot-separated spans would overflow. Strings unchanged |

## Gates

| Gate | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run test` | 146 web (139 + 7 new) + 49 electron |
| `pnpm run lint` | pass |
| `pnpm run build` | 15.50s (chunk-size advisory pre-existing) |

## Follow-ups

- **AC-7** stays open on this task; it holds at IMPLEMENTED until a human runs
  the resize check.
- Real nav counts are unwired. Not filed as a task yet — worth deciding whether
  the sidebar should show counts at all before plumbing hooks into the shell.
