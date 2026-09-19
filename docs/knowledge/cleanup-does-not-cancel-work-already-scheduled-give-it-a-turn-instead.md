---
type: learning
title: cleanup() does not cancel work already scheduled — give it a turn instead
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/components/__tests__/DocDiagrams.test.tsx
    commitSha: 
  - path: packages/web/src/components/MermaidBlock.tsx
    commitSha: 
createdAt: 2026-09-19
lastVerifiedAt: 2026-09-19
---

**Trigger:** one test in a file is slow, or flaky, but only when its siblings run before it. Run it alone with `-t` and it is instant.

**Context.** `DocDiagrams.test.tsx > offers Edit on a diagram that could not be drawn` was the single red in an otherwise green suite — the kind of failure that trains everyone to wave the suite through.

Measured, three runs per variant, timing from the mock throwing to the error node appearing:

```
as written                        : 883 ms, 924 ms, 38,876 ms
skip the 7 tests in OTHER blocks  : 848 ms, 789 ms,    815 ms   (no help)
skip the 4 tests in THIS block    :  17 ms,   6 ms,     16 ms   (the cause)
afterEach(cleanup)                : 907 ms, 879 ms,    891 ms   (no help)
an act()-wrapped 5 ms tick        :  12 ms,  10 ms,     24 ms
```

The cause: four tests in the same `describe` are **synchronous**. Each renders two mermaid fences, so each mounts two components that start an `await import(...)` + render nobody awaits, asserts on the synchronously-drawn part, and ends. That deferred work settles *during a later test*, and the fifth test — which waits for a DOM change of its own — queues behind all of it.

Two things the measurement settled that argument could not:

- **The 38,876 ms run reproduced in a single-file run.** The flake never needed parallel load; load only made it frequent. That reframes it from an environment problem into a defect in the file.
- **`afterEach(cleanup)` does nothing here.** It was the obvious fix and it was rejected on numbers, not on reasoning.

**Business rule.** Unmounting a tree does not cancel work that has already been scheduled against it. `cleanup()` removes the DOM; the pending promise chain still resolves, still runs its `.then`, and still costs the next test its time. If the problem is *work in flight*, the fix has to give that work a turn — not remove the thing it was going to touch.

**Resolution.** Let each test's own async work land in its own teardown:

```ts
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
```

**The `act()` wrapper is not decoration.** Without it the same tick produces 8 "not wrapped in act" warnings against a baseline of 0 — the updates were always happening outside `act`, the tick only made them visible. Trading one flake for eight new warnings is a bad deal and the next person will delete the fix.

Prefer fixing the root shape where you can: a synchronous test that mounts a component with an async effect is leaving work for its neighbours. The teardown tick is the file-wide guarantee when rewriting every sibling is not worth it.
