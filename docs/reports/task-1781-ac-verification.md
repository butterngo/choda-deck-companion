# TASK-1781 — AC verification

Session SESSION-1787661288825-49 · 2026-08-25 · merged as `03cf0fa` (PR #76)

**4 of 4 ticked.** All machine-class.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 fence → `<svg>` | ✅ | `mermaid-diagram` renders; the fence text is no longer queryable as a code block |
| AC-2 no fence → no import | ✅ | Zero module calls, **paired control** records exactly one for a doc that has a fence |
| AC-3 GFM table | ✅ | `getByRole("table")` with exactly 3 `<tr>` for a 2-row source table |
| AC-4 parse failure named | ✅ | `mermaid-error` carries the real message, source stays visible, rest of the doc renders |

## Bundle effect

| | |
|---|---|
| main before | 542.15 kB |
| main after | **584.27 kB** (+42 kB — `remark-gfm` plus wiring) |
| `mermaid.core` | its own **682.63 kB** chunk |
| kept out of main | **3,410 kB across 60 lazy chunks** |

## A test that measured the wrong thing first

AC-2 is "a document with no fence never imports mermaid". The first version counted **renders of `MermaidBlock`** and expected 1 — but React re-renders the component after its own `setState`, so a *correct* implementation showed 2.

The proxy did not measure the property. It now counts calls that cross into the mermaid module itself, which is what the AC is actually about. Recorded rather than quietly fixed, because the failure mode — a plausible proxy that tracks something adjacent — is the kind that survives review.

## Scope held

`diagrams` defaults **off**. Six components render through `CaptureMarkdown` (conversation threads, knowledge detail, task detail, vault, capture, docs); only `WorkspaceDocsView` opts in. A test asserts the fence stays a code block when the flag is absent, so the scope decision is enforced rather than merely intended.

`remark-gfm` is deliberately unconditional — ADR-031 and ADR-032 carry their decisions in tables, and those are read through knowledge detail too.

## Findings worth carrying

1. **Escaping through Python → heredoc → TypeScript silently produced a control character.** `\b` in a regex became a literal backspace (0x08), so `language-mermaid` never matched and the override fell through to the else branch. It typechecked, linted and looked right in a diff. Replaced with a plain `.split(" ").includes(...)`, which has no escape to lose.
2. **A proxy metric can move for reasons unrelated to the property** — see above.

## Gates

typecheck 0 · web 45 files / 284 tests 0 (+7) · electron+scripts 5 files / 72 tests 0 · lint 0 · build 0
No CI on this repo. Merge proven: `03cf0fa` is an ancestor of `origin/main`.
