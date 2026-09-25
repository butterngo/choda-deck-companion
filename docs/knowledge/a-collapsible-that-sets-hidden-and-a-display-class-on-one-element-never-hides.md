---
type: gotcha
title: "A collapsible that sets `hidden` and a display class on one element never hides"
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/views/ProjectVaultBlock.tsx
    commitSha: 
  - path: packages/web/src/views/__tests__/project-vault.test.tsx
    commitSha: 
  - path: packages/web/src/index.css
    commitSha: 
createdAt: 2026-09-20
lastVerifiedAt: 2026-09-20
affectedFeatureId: feature-companion-ui
---

**Trigger:** you build a collapsible, click it, and nothing moves. The chevron rotates, `aria-expanded` flips, the `hidden` attribute is visibly set in devtools — and the body stays on screen. Reported on 0.17.0 as "collapse and expand không work" (TASK-2051).

## Context

The row was written the way the rest of this codebase writes a mounted-but-hidden body (the TASK-2005 rule — an opened body stays mounted and is merely hidden, so an edited draft is never discarded):

```tsx
<div hidden={!open} className="mt-2 pt-2 border-t … flex flex-col gap-1.5">
```

Tailwind 3.4's preflight implements the attribute as

```css
[hidden]:where(:not([hidden=until-found])){display:none}
```

`:where()` contributes **zero** to specificity, so that selector is `(0,1,0)` — one attribute. `.flex{display:flex}` is `(0,1,0)` too — one class. Equal specificity means **source order decides**, and `@tailwind utilities` is emitted after `@tailwind base`. Measured in the built stylesheet: the `[hidden]` rule sits at char 204150, `.flex{display:flex}` at 226114.

`.flex` wins. The element is `display:flex` while carrying `hidden`.

## Business rule

**Nothing carrying the `hidden` attribute may also carry a display utility.** Put the layout classes on an inner wrapper:

```tsx
<div hidden={!open}>
  <div className="mt-2 pt-2 border-t … flex flex-col gap-1.5">…</div>
</div>
```

An element with `hidden` and no `display:` rule of its own is the only shape where preflight actually applies.

## Resolution — and the half that matters more

The bug is one line. The reason it shipped is the test:

```ts
expect(el.hidden).toBe(true)   // passes on a body that is plainly visible
```

`element.hidden` is the **IDL property reflecting the attribute**. It reads `true` whether or not any stylesheet honours it, so this assertion *cannot fail for the thing that broke*. jsdom loads no stylesheet, so `getComputedStyle` is blind here too — there is no runtime check available in a component test.

So assert the **structural rule** instead, and make the failure name the culprit:

```ts
const DISPLAY_UTILITIES = ["flex","grid","block","inline","inline-block",
  "inline-flex","inline-grid","table","contents","flow-root","list-item"];

for (const el of collapsibles) {
  const offender = [...el.classList].find((c) => DISPLAY_UTILITIES.includes(c));
  expect({ testid: el.dataset.testid, offender })
    .toEqual({ testid: el.dataset.testid, offender: undefined });
}
```

Re-introducing `className="flex flex-col"` reddens it with `offender: "flex"`.

This guard currently only covers `ProjectVaultBlock`'s subtree. The collision is repo-wide — INBOX-2065 tracks whether the right answer is an eslint rule, a shared helper applied at every collapse site, or raising `[hidden]` above utilities in the cascade.

## Related

- `jsdom-has-no-layout-engine-component-tests-cannot-see-off-screen-or-lazy-image-d` — adjacent, not the same: that one is about claiming a *positional* result from jsdom. This one is about an assertion that is blind by construction even where layout is irrelevant.
- TASK-2005 — the mounted-but-hidden rule this pattern exists to satisfy.
