---
type: learning
title: "A srcdoc frame inherits its parent's base URL, so #anchors and relative URLs resolve against the app"
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/lib/srcdoc-base.ts
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
  - path: packages/web/src/components/HtmlDocView.tsx
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
  - path: packages/web/src/lib/report-images.ts
    commitSha: 0ae42cfce8f59c377739677dbbbc078b48b27385
createdAt: 2026-09-25
lastVerifiedAt: 2026-09-25
---

**Trigger:** an HTML report rendered in the Docs pane (`<iframe sandbox="" srcdoc>`) has an in-page link (`<a href="#x">`, a table of contents, a CSS `:target` zoom) or a relative `src`, and it behaves differently in the app than when the file is opened in a browser.

**Context.** A `srcdoc` document's URL is `about:srcdoc`, but its **base URL is the parent document's URL**. In the companion that parent is `http://127.0.0.1:<port>/#/workspace-docs?...`. So:

- `<a href="#shot-3">` resolves to `http://127.0.0.1:<port>/#shot-3`. That is a different document, not a fragment of this one, so the sandboxed frame navigates to the app's own `index.html`. Symptom seen in companion 0.18.0 (TASK-2143): clicking a report thumbnail blanked the frame. The console showed "Blocked script execution in 'http://127.0.0.1:<port>/#shot-3'" plus CORS failures on the app's `/assets/*`.
- `<img src="screenshots/a.png">` resolves against the app too, so it never reaches the workspace file. That is why TASK-2142 inlines images as `data:` URIs.

**Business rule.** Pin the frame's base with `<base href="about:srcdoc">` (`withSrcdocBase`), inserted after `<head>`, or after the doctype when there is no head. Never insert it before the doctype, which forces quirks mode. A document with its own `<base>` is left alone. Fragment links then resolve to `about:srcdoc#x`, which is a same-document navigation, so `:target` applies.

**Testing trap. This is how the bug shipped.** The first verification hosted the srcdoc in a Chrome page whose URL *was* `report.html`. The broken navigation went to `report.html#shot-3`, which reloaded the same report with `:target` applied, so the test passed. A srcdoc test must run under a parent whose URL is **not** the document itself, ideally the real app (the installed companion serves its web UI on 127.0.0.1, and Playwright can drive it). Also check `location.href` inside the frame after the click (`about:srcdoc#x` versus an `http://` URL), not just the visual result.

**Resolution.** TASK-2143 (companion PR #158) adds `withSrcdocBase` in `HtmlDocView`. Related: TASK-2142 (image inlining), TASK-1956 (the sandboxed srcdoc frame).
