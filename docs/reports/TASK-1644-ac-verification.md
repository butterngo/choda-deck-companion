# AC verification — TASK-1644: Conversations: search by id/text, filter by project, dismissable thread pane

**Verdict:** 4/4 verified · every criterion proven end-to-end against a running app; no caveats, no testimony
**Date:** 2026-08-13 · **Session:** SESSION-1786589546706-1 · **Commit:** 0b93f64

## 1. Summary

| # | Criterion | Class | Verdict | Proof |
|---|-----------|-------|---------|-------|
| 1 | Search by id / raw title / shortened label, case-insensitive | machine | ✅ | `3000 … /automation` matches a string that exists only in the label |
| 2 | Project dropdown filters, shows counts, hidden at one project | machine | ✅ | micro-k8s→8 = API's 8; stub adapter proves the hidden branch |
| 3 | Search + project + chips compose, count reads "N of M" | machine | ✅ | "3 of 317" — distinct from all five single-filter counts |
| 4 | Close control empties the pane, filter state survives | machine | ✅ | closed from a 3-of-317 state; still 3 of 317 after |

✅ proven · ⚠️ proven with a caveat · ❌ failed · ⛔ blocked · 👤 needs a human

All four ran against the real adapter on `127.0.0.1:7338` — 317 conversations across
8 projects — driven through Chrome, not jsdom.

## 2. Done — what is proven

**AC-1 — search (EVT-1786589759697-2).** Three branches, each separately
discriminated:

- *id*: searched `conv-1786507936789-3` in lower case against a store whose ids are
  uppercase → 1 of 317. Case-sensitive matching returns 0 here.
- *title*: `telegram` matched `SendTelegramNode — 400 from notification service on
  dispatch` and `FE: Telegram node (parity with send-email)…` — capital T in both
  sources → 2 of 317.
- *shortened label*: searched `3000 … /automation`. That string exists **only** in
  the rendered label; the raw title is `Screenshot from
  http://localhost:3000/tung-nike-store/remote-workflow/automation` and contains no
  ellipsis and no ` … ` separator. A `matchesQuery` without the label branch returns
  0 rows. It returned 1 of 317.

**AC-2 — project dropdown (EVT-1786589769503-3).** Two branches, same build:

- *filters + counts*: `micro-k8s (8)` → exactly 8 rows, all micro-k8s topics. The
  API independently reports `micro-k8s: 8`. A count sourced from the unfiltered set,
  or a wrong predicate, disagrees visibly. `automation-rule (117)` matches the API's
  117 the same way.
- *hidden at one project*: the live store cannot produce this state, so a stub
  adapter (`scratchpad/solo-adapter.mjs`, port 7399) served two rows sharing
  `projectId: "solo-project"`, with vite pointed at it via `CHODA_COMPANION_API`
  (instance on :5175). The `<select>` is **absent** there — the search box sits
  directly on the chips, "2 threads" — while the identical build renders it against
  the 8-project store. A build that always rendered the select shows it in both.

**AC-3 — composition (EVT-1786589777419-4).** The expected intersection was computed
from the API *before* looking at the UI: automation-rule = 117, + decided = 106,
+ title~ichiba = **3**. Whole-store singles: decided = 287, ichiba = 9, all = 317.
With all three filters active the count line read **"3 of 317"** and exactly 3 rows
showed, each ichiba and decided. Because 3 is distinct from every single-filter
count, last-wins semantics or any two-of-three composition produces a different
number.

**AC-4 — close control (EVT-1786589786415-5).** Run *from* the composed state rather
than a clean one: opened `CONV-1785474388098-9` (rendered with its DECISION block),
clicked the header X. Pane returned to "No conversation selected", and the list still
read "3 of 317" with search `ichiba`, dropdown `automation-rule (117)` and the
Decided chip all intact. Closing from a narrowed state is what makes the
filter-survival half discriminating — an `onClose` that reset list state snaps back
to 317.

## 3. Not done — what is NOT proven

Nothing failed and nothing was skipped. No criterion was ticked on testimony, and
none carries a caveat.

Out of scope by the task's own wording, stated here so it is not mistaken for a
gap: **closing the conversation itself** (status → decided) is not implemented and
was never claimed. See §7.

## 4. Blockers

None.

## 5. Needs a human

None. All four criteria were machine-drivable via Chrome automation.

## 6. Steps — what was actually done, in order

1. `task_context(TASK-1644)` — ACs already in `- [ ]` form, no conversion needed.
2. Triaged 4 criteria: all machine-class. Flagged two gaps in the pre-verification
   claims — composition had never been run, and "shortened label" had not been
   discriminated.
3. **Rejected test:** searching `localhost:5175` to prove the label branch. The raw
   title `Screenshot from http://localhost:5175/#/knowledge` contains that substring
   too, so the title branch alone satisfies it — pass and fail look identical.
   Discarded before running.
4. Queried the API for a title whose label provably diverges from it; found the
   multi-segment `localhost:3000/tung-nike-store/remote-workflow/automation`, whose
   label is `localhost:3000 … /automation`.
5. Drove `#/conversations` on :5173, searched `3000 … /automation` → 1 of 317. AC-1.
6. Computed the three-filter intersection from the API (3) before touching the UI,
   then set search + project + chip → "3 of 317", 3 rows. AC-3.
7. From that state opened a thread, clicked X → empty pane, "3 of 317" intact. AC-4.
8. Wrote a single-project stub adapter, ran a second vite against it, confirmed the
   dropdown is absent. AC-2.
9. Four `ac_check` calls, one per criterion, each carrying its discriminator.

Two mechanical notes for whoever replays this: the `type` action did not land in the
search box after a fresh page load — `form_input` against the element ref was
reliable. And the second vite bound IPv6-only, so `127.0.0.1:5175` refused
connections while `localhost:5175` worked.

## 7. Findings

⚠️ **The companion cannot close a conversation, and the UI now has a control that
looks like it might.** The X dismisses the reader only. The adapter
(`src/adapters/companion/http-server.ts`, vendored as
`electron/vendor/companion-server.cjs`) routes exactly two conversation paths, both
GET; every other method answers 405. The domain layer underneath already supports
the write — `conversations.update(id, {status:'decided', …})` is used by the
inbox-convert path — so this is a missing HTTP surface, not missing logic. Filed as
INBOX-1738 against choda-deck. Until it lands, someone will click that X expecting
the thread to close.

⚠️ **`/conversations` without the hash renders a blank pane.** The app is
hash-routed; `http://localhost:5173/conversations` silently redirects to `#/sync`
and shows an empty shell. Pre-existing, unrelated to this change, but it cost a
couple of minutes here and will cost the next person the same.

**Capture rows dominate the store.** 317 threads, and the majority are
machine-generated screenshot/network captures. That is the condition this task was
built for, and it is worth knowing the ratio holds: the "Discussions" chip is the
one most people will want by default.
