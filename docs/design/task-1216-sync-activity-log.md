# TASK-1216 — Sync activity log (design handoff)

Produced via the TASK-1210 pipeline (AC-4): brief → Claude Design project
**"Choda Sync Activity Log"** (`claude.ai/design/p/9eff49e4-1722-42a7-bf62-dcbf78bc163a`),
generated 2026-07-15 against the **Choda Design System** (`377f1810-…`, org default).
Source file in that project: `Sync Activity Log.dc.html` (pulled via DesignSync).

## What the implementation takes from it

Card: header strip (`SYNC ACTIVITY` mono uppercase label + live dot, conflict-count
badge when > 0, refresh button) · filter chip strip (All / Pull / Push / Drain /
Conflicts (n)) · feed body.

Row anatomy: 32px icon tile (kind-tinted bg, lucide-style stroke icon) · relative
time, absolute on hover (`title`) · kind badge (mono uppercase, kind-tinted) ·
count chips (`+upserted` green, `−tombstoned` red, `↑pushed` blue, `N conflicts`
red bold; "no changes" when all zero) · italic note line.

Conflict rows: red 2px left border + `#fff8f7` tint — never blended (honesty rule).

States: empty (clock icon + "No sync activity yet"), loading (skeleton rows incl.
one conflict-shaped), error (red callout with detail line), populated, filtered-empty.

## Deliberate deviations

- The design's ledger mock + preview-state switcher are design-context only — the
  app already has `LedgerTable`, and states come from the real hook.
- Kind colors mapped to Tailwind classes closest to the design hexes.
