# TASK-1594 — AC verification

**Task:** Web · shared state components (Skeleton / EmptyState / ErrorState / CapabilityNote)
**Session:** SESSION-1786159735559-42
**PR:** [#52](https://github.com/butterngo/choda-deck-companion/pull/52) — squash-merged as `538844c`
**Merge proof:** `git merge-base --is-ancestor 538844c7d7b775654ae89f85a0c38cb937ecc402 origin/main` → ancestor ✅

**Result: 6/6 verified · 0 blocked · 0 needing a human.**

## Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `Skeleton` with shape prop, `aria-hidden` bars, `role="status"` wrapper | ✅ | Wrapper asserts `role=status` + `aria-busy`; `skeleton-bars` asserts `aria-hidden="true"`; shapes compared pairwise by markup |
| 2 | `EmptyState {icon,title,description,action?}`, no empty button when action absent | ✅ | `queryByRole("button")` is null without `action`; present with it |
| 3 | `ErrorState` required `variant`; `failed` must not contain "Can't reach" | ✅ | `failed` renders `Couldn't load adr-028` and `container.innerHTML` does **not** match the unreachable copy |
| 4 | `CapabilityNote` neutral zinc, no `rose-` token | ✅ | `innerHTML` asserted against `/rose-/`; also asserts it is not `role="alert"` |
| 5 | Four test files under `state/__tests__/`, all pass | ✅ | 4 files / 15 tests green |
| 6 | Pre-existing tests pass unmodified; no view wired | ✅ | `git diff` over `src/views` empty; `git status` showed only untracked new files — **zero modified** |

## Discriminators, stated

Each test was written so a plausible-but-wrong implementation fails it:

- **ErrorState** — a component rendering one message for both variants passes
  every other assertion in the file. The criterion is
  `container.innerHTML` **not** matching the unreachable copy under
  `variant="failed"`. That single assertion is the reason this component exists.
- **Skeleton** — a component ignoring `shape` and always drawing the same bars
  passes a "renders something" check. Shapes are compared pairwise by markup.
- **EmptyState** — a wrapper rendered unconditionally is invisible to a
  "renders the action" test. The assertion is the *absence* of any button.
- **CapabilityNote** — the contract is a colour it must never use, so the test
  asserts `/rose-/` is absent rather than trusting the class list.
- **AC-6** — a green suite alone would not prove the presentation-only
  invariant, since editing a component and its test together stays green. The
  discriminating check is the empty `git diff` over `src/views`.

## One interpretation to record

The AC text writes the copy as `"Can't reach the laptop API"` with a straight
apostrophe. Every existing view in this app uses the typographic form
(`Can’t`). The shipped copy follows the app's existing style, and the tests
assert with `/Can.t reach the laptop API/`, which tolerates either — so the
assertion tests the *sentence*, not the punctuation.

This is a deliberate reading of the criterion, not a silent deviation.

## Gates

| Gate | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run test` | 139 web (124 + 15 new) + 49 electron |
| `pnpm run lint` | pass |
| `pnpm run build` | 10.20s, CSS 255.44 kB |

## Findings

**These components are still unproven where it counts.** They pass 15 tests and
no view renders one of them yet. TASK-1596/1597 are where the design gets
exercised — and per TASK-1593's finding, the gates cannot detect a visual
regression. The states will need a human look once a view is wired.

## Follow-ups

None. No loose ends.

TASK-1596, TASK-1597, TASK-1602 and TASK-1603 all list this task as a blocker;
TASK-1595 is the remaining one before they unblock.
