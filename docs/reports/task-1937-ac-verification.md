# TASK-1937 — AC verification

**Web: edit a fence, preview it, save it — in the Docs pane**
Session SESSION-1789046989121-71 · PR #136 · merged `5214dd0`
Verified 2026-09-10 by the `/choda-burn-backlog` runner (unattended).

**Result: 8 / 8 ticked. Merge proven.**

## Per criterion

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 the model is pressed, never triggered | OK | mount + fence edit + ten instruction keystrokes record **zero** calls; Ask AI records exactly one. Control included |
| AC-2 the save carries the read's version | OK | one PUT whose `if-match` equals the etag from the read |
| AC-3 a 409 keeps the edit | OK | message shown, edited text still in the textarea, PUT count stays 1 |
| AC-4 each limit says which one | OK | 413/400/415 render their own sentence, and a fourth test asserts the three strings form a **set of three** |
| AC-5 missing model invites, failure errors | OK | 501 renders a CapabilityNote with no error state; 429 and `kind: network` differ |
| AC-6 a refused proposal is not offered | OK | 422 shows the parser's line, the draft keeps the ORIGINAL, Save stays disabled |
| AC-7 the picture AND the diff | OK | diagram element carries the new text and the diff shows both a minus and a plus line, before any save |
| AC-8 confirm, then say what happened | OK | a declined confirm records zero PUTs; success renders `role="status"`, failures `role="alert"` |

## Injections — all three from the task's Test Plan

| injection | expected | observed |
|---|---|---|
| PUT without `if-match` | AC-2 red | AC-2 red, alone |
| `/diagram` called on open | AC-1 red | AC-1 red **plus seven others** — a call on mount poisons every call-log assertion |
| rejected proposal placed in the editor | AC-6 red | AC-6 red, alone |

## The assertion that would otherwise have been decorative

AC-4 asks for three *distinct* messages. Three tests each asserting "the error
contains X" would all pass against a single generic sentence that happened to
contain all three words — a criterion that cannot fail. The fourth test collects
the three rendered strings and asserts `new Set(...).size === 3`, which is what
actually forbids a shared failure message.

## Findings

1. **`fetchWorkspaceDoc` was stripping the BOM.** It used `res.text()`. A client
   decoding that way hands back a file it has already altered, and the
   byte-exact server faithfully writes the alteration. Now reads bytes, decodes
   with `ignoreBOM`, and carries the etag. This was the load-bearing change of
   the task and it was in the READER, not the editor.

2. **`replaceFence` splices by line range, not string search**, and matches the
   document's own endings. Both directions are tested: only testing CRLF would
   let a splicer that always emits CRLF pass while corrupting every LF document.
   A separate test proves it edits the *second* of two identical diagrams.

3. **A second `listMermaidFences` now exists**, in the web client, because the
   two repos cannot import each other. Named at the top of the file and filed as
   **TASK-1943** — the risk is not the duplication, it is that a disagreement is
   currently undetectable.

## Gates

typecheck 0 · lint 0 · build 0 · **661 tests across 69 files, 0 failed**

This repo has **no CI workflow**, so the PR's `statusCheckRollup` is empty. That
is a known gap (recorded in the inbox), not a passing run — the only verification
this change got remotely is the empty set.
