# AC verification — TASK-1564: /choda-watch skill — video URL to summarized vault note

**Verdict:** 8/15 verified · holds at IMPLEMENTED — 3 machine criteria never exercised, 4 need a human
**Date:** 2026-08-05 · **Session:** SESSION-1785902012866-1 · **Commit:** n/a — `~/.claude/` is not version-controlled (recorded as a decision in the task body)

## 1. Summary

| # | Criterion | Class | Verdict | Proof |
|---|-----------|-------|---------|-------|
| 1 | YouTube URL with human captions → note | machine | ❌ | never run — the only real video had auto captions |
| 2 | All URL forms → one video id | machine | ✅ | 7 shapes + 2 live runs hitting one cache file |
| 3 | T1 → T2 fallback, tier in frontmatter | machine | ❌ | T1 succeeded; T2 has never executed against a live site |
| 4 | NO_CAPTIONS message, no note written | machine | ❌ | previously covered; the VIDEO_UNAVAILABLE fix removed that coverage |
| 5 | Cache outside vault, no refetch | machine | ✅ | `fetched_at` unchanged across 2 later runs; 0 JSON in vault |
| 6 | Rolling duplicates removed | machine | ✅ | unit case collapses 5→3; 340 raw segments → 14 clean blocks |
| 7 | Note path + full frontmatter | machine | ✅ | all 8 required keys parsed; `tier: T1` matches the run |
| 8 | No write without confirmation | machine | ⚠️ | process record only — enforced by instruction, not code |
| 9 | Inbox items carry note path + anchor | machine | ✅ | INBOX-1670 contains path, URL, `[10:11]`, `[08:56]` |
| 10 | >2h emits LONG_VIDEO warning | machine | ❌ | no long video run |
| 11 | ≤8 key points, ≤5-line TL;DR | machine | ⚠️ | 8/8 and 5/5 — but only after the first draft failed at 7 lines |
| 12 | Key points read as claims, not topics | human | 👤 | needs the user's judgement |
| 13 | `[mm:ss]` anchors land correctly | human | 👤 | needs clicking through in a browser |
| 14 | English summary from Vietnamese source | human | ✅ | 0 Vietnamese diacritics in body; verified mechanically |
| 15 | Note replaces a rewatch | human | 👤 | the criterion the whole design exists to satisfy |

✅ proven · ⚠️ proven with a caveat · ❌ failed or not run · 👤 needs a human

## 2. Done — what is proven

**#2 URL normalization.** `video_id_from` collapses bare id, `watch?v=`, `list=` before `v=`,
`youtu.be/?si=`, `/embed/`, `youtube-nocookie/embed/` and `/shorts/` to one id; vimeo returns
`None` as designed. Confirmed live: the bare id and the `youtu.be/` form both hit
`OjPPg8UMvW8.json`. *Discriminator:* a broken regex yields `None` or differing ids, producing
separate cache files. `EVT-1785903757458-2`

**#5 Cache placement + no refetch.** Cache resolves to `~/.cache/choda-watch/`; the vault holds
zero JSON. The second and third runs reported `cached=True` with `fetched_at` still stamped
`04:01:40` while the runs happened ~04:05. *Discriminator:* a refetch rewrites that timestamp.
`EVT-1785903765651-3`

**#6 Duplicate removal.** Rolling input of 5 fragments collapses to exactly 3 lines with
`[Music]` stripped; the live video's 340 raw segments became 14 blocks with no visible repeats.
*Discriminator:* without dedupe the same input yields 7 lines with two doubled.
`EVT-1785903774685-4`

**#7 Note path + frontmatter.** All 8 required keys parsed programmatically, `generated_by:
claude`, `tier: T1` matching the actual run. *Discriminator:* `tier` carries run data rather
than a constant. `EVT-1785903782689-5`

**#9 Inbox anchors.** INBOX-1670 embeds the note path, source URL and the two anchors its
reasoning rests on. *Discriminator:* a template would file bare text with neither.
`EVT-1785903800288-7`

**#14 English output from Vietnamese source.** Contract records `lang=vi`; note body contains
0 Vietnamese diacritics (the original title is deliberately retained in frontmatter, so the
check scopes to the body). *Discriminator:* a pass-through would score hundreds.
Classified human in the AC list but proven mechanically — no testimony involved.
`EVT-1785903816350-9`

## 3. Not done — what is NOT proven

### Not run (3)

**#1 Human captions.** The only real video (`OjPPg8UMvW8`) had `captions: auto`. The AC names
human captions specifically and that path has never executed. Worth noting the AC is weakly
worded: what it really checks is "the happy path produces a note", which *was* demonstrated —
the human/auto distinction governs note *quality*, not pipeline function.

**#3 T2 fallback.** The largest untested surface in the change. T1 succeeded on the only real
video, so `tier2()` — yt-dlp invocation, VTT file selection by language tag, and the parser
against a real subtitle file — has only ever run against a synthetic VTT string in a unit check.
The parser is proven; the acquisition around it is not.

**#10 LONG_VIDEO warning.** No video over 2h was run. The threshold logic is 3 lines and reads
correctly, but reading is not running.

### Proven with a caveat (2)

**#8 No write without confirmation.** ⚠️ The note was rendered in chat and written only after
the user's "1 yes"; the inbox item only after "2 create inbox…". But this is enforced by
SKILL.md prose, not by code, and stages 2–3 are model-driven so a code gate isn't available.
A future run could violate it with nothing to stop it. Ticked on process record, not on a
forced failure path.

**#11 Format caps.** ⚠️ Currently 8 key points and 5 TL;DR lines — but the **first draft failed
at 7 lines and was reported as passing by eye.** The mechanical count caught it. SKILL.md now
specifies the cap counts physical lines rather than sentences. Separately, the AC says
"hour-long video" and the source was 17m, so the drop-the-weakest rule the cap exists to force
was never triggered.

## 4. Blockers

None. Nothing was environmentally prevented; the unrun criteria simply need input videos of
specific kinds, which is a materials question rather than a broken-tooling one.

## 5. Needs a human

**#12 — Key points read as claims.** Open `vault/30-Knowledge/video-cogover-crm-overview.md`
and read the 8 bullets. Each should assert something specific enough to be wrong. If any reads
as a topic label ("covers campaigns"), it fails.

**#13 — Anchor accuracy.** Open the video and check three: `[10:11]` should be the three-tier
architecture, `[08:56]` the automation trigger types, `[03:52]` the activity/click-to-call
section. Anchors come from `segments[].start` and are block-granular (~75s), so landing within
the block is a pass; landing in a different topic is a fail.

**#15 — Does it replace a rewatch?** The criterion the design exists for. Answerable only by
using the note later, not by inspecting it now.

## 6. Steps

1. Installed `youtube-transcript-api` + `yt-dlp` (2026.07.04). **Found:** the installed v1.x
   API exposes only `fetch`/`list` — the `get_transcript` classmethod is gone. Code written
   against the real surface rather than the documented-from-memory one.
2. Offline checks of `video_id_from`, `dedupe_lines`, `parse_vtt`, `to_seconds` — all passed.
3. Verified tag/entity cleaning end-to-end through `parse_vtt` → `dedupe_lines` rather than
   assuming it, since `parse_vtt` alone leaves `<c>` and `&amp;` intact by design.
4. Live run on `OjPPg8UMvW8` — exit 0, `tier=T1 captions=auto lang=vi`, 14 blocks, 17m.
5. **Rejected attempt:** inspecting the cache with default stdout crashed with
   `UnicodeEncodeError` on cp1252. This was not a test failure but a genuine bug — `--print`
   was unusable for any non-Latin-1 transcript. Fixed by reconfiguring stdout/stderr to UTF-8.
6. Distilled and wrote the note; filed INBOX-1670 after explicit approval of each.
7. Programmatic frontmatter + cap check. **Caught the 7-line TL;DR** that had been reported as
   passing. Note rewritten; SKILL.md cap definition tightened.
8. `NO_CAPTIONS` probe with a well-formed nonexistent id `AAAAAAAAAAA` → exit 2 with the right
   text, **but** yt-dlp's `ERROR: Video unavailable` leaked to stderr and the message asserted
   a cause that was false.
9. Fixed: added a metadata probe distinguishing unreachable from uncaptioned, a new exit 5
   `VIDEO_UNAVAILABLE`, and a null logger silencing yt-dlp. Re-ran: exit 5, clean message,
   no leak. Regression-checked the working path — still exit 0, `cached=True`.
10. **Consequence recorded:** the fix rerouted the step-8 probe to exit 5, so `NO_CAPTIONS`
    (#4) lost its only coverage and was dropped from the tick list. 9 proposed → 8 ticked.

## 7. Findings

⚠️ **The NO_CAPTIONS message could send you down a dead end.** Before the fix, a private,
deleted, region-locked or mistyped video reported "this video has no captions" and pointed at
Whisper — none of which would help. Fixed during verification, but it illustrates the class:
this pipeline has several failure modes that look alike from the outside and must be told apart
deliberately.

⚠️ **A cap enforced only by prompt was violated on the very first note produced.** The
instruction was explicit and still drifted, and the drift was invisible to inspection-by-eye —
it took counting. If it recurs, the fix is a post-write validator, not firmer wording. This
matches the recalled memory that a repeatedly-violated discipline note should become a
mechanical guard.

⚠️ **The most valuable content in the produced note came from noticing an absence** — the intro
promises AI behaviour analysis, demand forecasting and next-action suggestions, and none of it
appears in the remaining 16 minutes. Nothing in the format explicitly asks for that; it fell out
of the Unclear section existing. Evidence the section earns its place.

ℹ️ **Auto-caption proper-noun damage is severe.** "Cogover" appeared as Cver / Ccover / Cocover /
CGOV / Coccover, and CRM as CIM/CM. Recovered from the video title. Any note built on `captions:
auto` should be treated as weaker evidence — which is why `tier` is in the frontmatter.

ℹ️ **Cache path differs from the spec.** The Design section names `<scratch>/watch-cache/`; the
implementation uses `~/.cache/choda-watch/` (overridable via `CHODA_WATCH_CACHE`). Same intent —
outside the vault — but the body says something the code does not do.

ℹ️ **No version control on any of this.** `~/.claude/` is not a git repo, so there is no commit
to cite, no diff to review, and no way to revert. This predates the task and affects the whole
`choda-*` skill family, but it means this report is the only durable record of what changed.
