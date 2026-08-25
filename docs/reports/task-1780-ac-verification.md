# TASK-1780 — AC verification

Session SESSION-1787660879665-39 · 2026-08-25 · merged as `9ea2818` (PR #75)

**4 of 4 ticked.** All machine-class; nothing left for a person.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 children leave the DOM | ✅ | Closing `docs/knowledge` makes both ADR rows `queryByText → null` |
| AC-2 survives selecting elsewhere | ✅ | Close `data/`, click `guide.md` under `docs/` → `onSelect` fires and `data/` is still `aria-expanded="false"` |
| AC-3 all open on first render | ✅ | Four folders all `true`, `adr-001.md` visible with no click |
| AC-4 real `aria-expanded` on a `<button>` | ✅ | `tagName === "BUTTON"`, `true` → click → `false` |

## Injection

Render children unconditionally (drop `{open &&`) → **3 tests red**: children leave the DOM, reopens on second click, survives selecting elsewhere. Confirmed applied by grep before the result was trusted.

## What made the assertions discriminate

- **AC-3 is enforced by the data shape, not by an initial value.** State stores *closed* paths, so an empty set cannot mean "all shut". Storing open paths would have made the default depend on remembering to seed it.
- **AC-4's second half is the whole test.** A hard-coded `aria-expanded="true"` passes "the attribute exists". Only the flip proves it is wired.
- **A sibling assertion guards over-collapse.** "closes only the folder that was clicked" would fail a toggle that collapsed everything — which would otherwise pass AC-1.

## Findings worth carrying

1. **A decorative control reads as a broken one.** The chevron was already drawn, static and `aria-hidden`. INBOX-1868 assumed the flooded pane needed a depth cap or a skip-list change; it needed the control the icon was already promising.
2. **Lifting state was about the guarantee, not the bug.** Per-row `useState` would have passed AC-2 today, because React keeps the instance when the key is stable. That is a reconciler property, not a decision, and it would break silently the first time keys changed.
3. **`git checkout --` on an uncommitted file discards it.** Reverting the injection that way threw away the implementation, which had not been committed yet. Re-done from scratch. Commit before injecting, or restore from a copy rather than from HEAD.

## Gates

typecheck 0 · web 44 files / 277 tests 0 (+8) · electron+scripts 5 files / 72 tests 0 · lint 0 · build 0
No CI on this repo. Merge proven: `9ea2818` is an ancestor of `origin/main`.
