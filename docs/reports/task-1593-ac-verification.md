# TASK-1593 — AC verification

**Task:** Web · shadcn/ui init + existing tokens wired as its theme
**Session:** SESSION-1786096281166-1
**PR:** [#51](https://github.com/butterngo/choda-deck-companion/pull/51) — squash-merged as `a7e3ae4`
**Merge proof:** `git merge-base --is-ancestor a7e3ae43b5e4a0313f80cdac0b9ab54f0e6c6c91 origin/main` → ancestor ✅

**Result: 5/5 verified · 0 blocked · 0 needing a human.**

All criteria were machine-class. Each was verified at its own surface — the
config file, the CSS, the manifest, the git diff — not by re-reporting the §6
gate output.

## Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `components.json` sets style / baseColor / rsc / aliases | ✅ | Parsed: `style=default`, `tailwind.baseColor=zinc`, `rsc=false`, `aliases.components=src/components/ui` |
| 2 | Theme vars resolve to the existing zinc palette; `--ring` = blue-600 | ✅ | `--ring: 37 99 235` at `index.css:41` and `:66`, identical to the pre-existing `outline: 2px solid rgb(37 99 235)` at `:98`. `--background` / `--foreground` / `--border` / `--muted-foreground` / `--accent` hold exact zinc steps, not shadcn defaults |
| 3 | `darkMode: "class"` kept; vars redefined under `.dark` | ✅ | `tailwind.config.js:6`; exactly one `.dark {` block in `index.css` redefining all 20 variables |
| 4 | Radix a real dependency; no CDN or webfont added | ✅ | 4 `@radix-ui/*` entries in `packages/web/package.json`; `git diff origin/main -- packages/web/index.html \| grep -c "^+.*<link"` → `0` |
| 5 | Existing tests pass unmodified | ✅ | `git diff --name-only origin/main -- packages/web/src/components packages/web/src/views` returned nothing at `7eb3cac`; 124 web + 49 electron tests green against unmodified sources |

## Discriminator note on AC-5

AC-5 is the presentation-only invariant, and a green suite alone would not prove
it — a suite stays green if you edit both a component and its test. The
discriminating check is the **empty diff** over `src/components` and
`src/views`: it fails loudly if any component was touched, whatever the tests
say. That is why the evidence cites the diff first and the test count second.

## Gates (§6) — context, not AC evidence

| Gate | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run test` | 124 web + 49 electron, all pass |
| `pnpm run lint` | pass |
| `pnpm run build` | built in 11.19s, 304 modules |

Baseline was captured before any edit (same four gates, identical results), so
nothing here is a pre-existing failure being waved through.

## Findings

**A default-scaffold footgun caught before commit.** shadcn's standard config
remaps `borderRadius` to `lg/md/sm = calc(--radius ± 2px)`. Applied blindly it
would have shifted every corner in the app — `rounded-md` appears 41 times,
`rounded` 27, `rounded-sm` 1 — silently violating the no-visual-change
invariant while all four gates stayed green. The remap was dropped and the
reason recorded in `tailwind.config.js`; `--radius` is still defined for
components that reference it directly.

Corollary for the rest of TASK-1592: **the gates cannot detect a visual
regression.** Only the empty-diff criterion and human review can, which is why
TASK-1596 / 1597 carry the same diff assertion.

## Follow-ups

None. No loose ends; nothing deferred.

TASK-1594 (state components) and TASK-1595 (sidebar shell) are unblocked by
this merge.
