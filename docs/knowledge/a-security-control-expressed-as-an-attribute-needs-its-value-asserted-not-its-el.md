---
type: learning
title: A security control expressed as an attribute needs its VALUE asserted, not its element found
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/components/HtmlDocView.tsx
    commitSha: 3c6b0daa2c6f8452322806c9afabc7212190c91d
  - path: packages/web/src/components/__tests__/html-doc-view.test.tsx
    commitSha: 3c6b0daa2c6f8452322806c9afabc7212190c91d
createdAt: 2026-09-14
lastVerifiedAt: 2026-09-21
---

**Trigger:** you are testing something whose protection lives in an HTML attribute — `sandbox`, `rel="noopener"`, `integrity`, `SameSite`, `Content-Security-Policy`, `referrerpolicy` — and you write a test that finds the element.

## Context

These controls share a property that makes them uniquely easy to test badly: **removing the protection changes nothing visible.** An iframe with `sandbox=""` and one with `sandbox="allow-scripts allow-same-origin"` render the same pixels, pass the same accessibility snapshot, and satisfy any assertion phrased as "the frame exists".

So the usual instinct — locate the element, assert it is there — produces a test that passes against a build with the protection stripped out. It cannot fail in the direction that matters.

## Business rule

**Assert the attribute's VALUE, and assert what must NOT be in it.** For a sandbox that must grant nothing:

```ts
expect(sandbox).not.toBeNull();      // a missing attribute is a full-privilege frame
expect(sandbox).toBe("");            // present and empty
expect(sandbox).not.toMatch(/allow-scripts/);
expect(sandbox).not.toMatch(/allow-same-origin/);
expect(sandbox).not.toMatch(/allow-/);   // any token at all
```

The negative matchers are not redundant with `toBe("")`. They survive a later change that legitimately adds one token, and they say in the test which two tokens are the fatal pair — `allow-scripts` runs the untrusted content, `allow-same-origin` hands it your origin. Either alone is survivable; together they are equivalent to no sandbox at all.

## Prove it can fail

Inject a permissive value and watch the test redden. In `TASK-1956`, setting `sandbox="allow-scripts allow-same-origin"` reddened both the component test and the view test; without that injection, neither assertion had been shown to discriminate.

## A second, stronger proof if the surface allows it

Isolation can sometimes be observed rather than asserted. With a sandboxed frame, the parent page's own JavaScript **cannot** read `frame.contentDocument` — it returns `null`, because the document has an opaque origin. Playwright's `frameLocator` reaches in anyway, since it operates at the browser level rather than from the page.

That asymmetry is the sandbox working, watched from outside, and it is worth capturing when you have a real browser available: the attribute says what was intended, the null `contentDocument` shows what the browser actually enforced.

## Related

- `HtmlDocView.tsx` — the frame, and the comment explaining why the attribute is empty on purpose.
- The adapter's matching header: `Content-Security-Policy: sandbox` on `.html` responses, the same posture for any consumer that fetches the URL directly rather than rendering it in the pane.
