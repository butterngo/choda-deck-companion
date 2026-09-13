# AC verification — TASK-1931: Edit a mermaid fence in the Docs pane — AI proposes, the adapter parses, the human saves

**Verdict:** 10/11 verified · task stays at IMPLEMENTED — AC-11 is human-class and needs Butter at the packaged app
**Date:** 2026-09-12 · **Session:** SESSION-1789106258658-1 · **Commit:** `96a7126` (companion), `origin/main` (choda-deck adapter)

Verified against **purpose-written drivers**, not the authors' test files. Two temporary
drivers were created, run, and deleted; both repos are clean. The adapter criteria were
driven over real HTTP against a real `startCompanionServer`; AC-10 was driven through the
real `WorkspaceDocsView` + `api.ts` with `fetch` itself as the recorder.

`ac_review` graded all 11 criteria `ok` — every one already names its own fail condition,
which is why each was testable as written.

## 1. Summary

| # | Criterion | Class | Verdict | Proof |
|---|-----------|-------|---------|-------|
| AC-1 | PUT with no `if-match` → 400, bytes unchanged | machine | ✅ | 400 `if-match required`; sha256 identical before/after |
| AC-2 | Stale hash → 409, other writer's bytes survive | machine | ✅ | 409; disk still held the other handle's content |
| AC-3 | CRLF + BOM round trip byte-identical | machine | ✅ | `Buffer.compare` = 0; BOM `239,187,191` intact both ways |
| AC-4 | Two real ABCV2 defects rejected with a line; repairs pass | machine | ✅ | broken → `ok:false` line 4 / line 3; fixed → `ok:true` |
| AC-5 | `/diagram/check` works keyless with zero outbound requests | machine | ✅ | 200 with no key files; **0** recorded requests |
| AC-6 | Two unparseable proposals → 422, `attempts:2`, no write | machine | ✅ | 422 + `parseError`; sha256 unchanged |
| AC-7 | Junk then valid → 200 with `attempts:2` | machine | ✅ | 200, `attempts:2`, the second answer returned |
| AC-8 | No route but `/diagram` reaches the provider | machine | ✅ | 6 driven surfaces, **0** provider calls; control proved the recorder live |
| AC-9 | Out-of-range `fenceIndex` → 404 naming index + count, no write | machine | ✅ | `no fence 7: doc.md has 1`; 0 provider calls |
| AC-10 | Press = 1 `/diagram` call; open / type / switch = 0 | machine | ✅ | full call log across all four interactions |
| AC-11 | Packaged app: `git diff` shows only the fence's lines | human | 👤 | **not run** — needs a person at the installed app |

✅ proven · 👤 needs a human

## 2. Done — what is proven

Every criterion below was run at its real surface. The **discriminator** column of this
report is the point: for each, a broken build produces visibly different output.

**AC-1** — `PUT /workspace-docs/main/doc.md` with no `if-match`, body `CLOBBERED`.
Response `400 {"error":"if-match required"}`; file sha256
`5444cad6…172f` before *and* after; the body never contained `CLOBBERED`.
*Discriminator:* proven by injection — removing the precondition turned this into
`200 {"sha256":"8ddb948b…","bytes":9}` and the file was overwritten.

**AC-2** — read the etag, then wrote `# written by the other handle` from a second
handle, then `PUT` with the now-stale etag. Response
`409 {"error":"file changed on disk","sha256":"97a91c45…"}`; disk still read
`# written by the other handle\n`.
*Discriminator:* the same injection made this `200` and the stale writer's text won.

**AC-3** — fixture written as CRLF throughout with a UTF-8 BOM. Served bytes compared
to disk bytes: head `[239,187,191,35,32]` on both, `served has CRLF: true`,
`Buffer.compare` = 0. PUT of those exact bytes back: `Buffer.compare(after, disk)` = 0.
*Discriminator:* a normalising reader or writer changes the head bytes (BOM stripped) or
the line endings; both are visible in the printed byte arrays, not inferred.

**AC-4** — the two defects retyped from the ADRs the task names, each with its repair:

- `H-->>LA: PageResult&lt;AccountListItem&gt;` → `ok:false`, **line 4**,
  `got 'NEWLINE'` — the entity decoded into an arrow and the message stopped being a message.
- `SS[SecretStore\n{{secrets.KEY}}]` → `ok:false`, **line 3**, `got 'DIAMOND_START'`.
- `PageResult#lt;…#gt;` → `ok:true`. `SS["SecretStore\n{{secrets.KEY}}"]` → `ok:true`.

*Discriminator:* this is the criterion's own stated fail mode — "both inputs answer the
same". They answer differently, in both directions, with different line numbers.

**AC-5** — deleted `ai-key.txt` and `ai-provider.json`, then checked a valid and an
invalid diagram. `200 {"ok":true}` and `200 {"ok":false,…line:3}`;
**`outbound requests recorded: 0 []`**.
*Discriminator:* two things at once — it did not answer 501, and it still told the two
inputs apart without a key, so the keyless path is doing real parsing rather than
defaulting to a verdict.

**AC-6** — scripted the model to return junk twice.
`422 {"error":"model output does not parse","parseError":"No diagram type detected…","attempts":2}`,
2 provider calls, file sha256 unchanged.
*Discriminator:* proven by injection — returning the model's output unparsed made this
`200 {"mermaid":"this is not mermaid at all","attempts":1}`, which is the AC's exact
stated failure ("200 with junk").

**AC-7** — junk once, then valid. `200 {"mermaid":"flowchart TD\n  A-->B\n  B-->C","attempts":2}`.
*Discriminator:* the same injection dropped it to `attempts: 1` — the AC's own words,
"gives up after the first failure, which makes the retry decorative".

**AC-8** — drove six surfaces that a leak would use: `GET …?ai=true`,
`PUT …?ai=true&review=1` with `x-ai: 1`, and `/diagram/check` with `?ai=true`,
`?review=1`, header `x-ai`, and all three together. GET 200, PUT 200, four checks 200.
**`PROVIDER CALLS RECORDED: 0 []`**.
*Discriminator:* the control. Immediately after, the paid route was called and the
recorder logged exactly 1 — so the zero above is a measurement, not a dead recorder.

**AC-9** — `fenceIndex: 7` against a one-fence file.
`404 {"error":"no fence 7: doc.md has 1"}` — names both the index and the count.
File sha256 unchanged, **0 provider calls**: it refused before paying to find out.

**AC-10** — real `WorkspaceDocsView`, real hooks, real `api.ts`, `fetch` as the recorder.
Only `MermaidBlock` was stubbed (80 MB and needs layout jsdom has not got) and
`useOutletContext`. The log across the four interactions:

```
after OPEN   0 diagram calls  ["GET /api/workspace-docs?workspaceId=main&include=all",
                               "GET /api/workspace-docs/main/alpha.md"]
after TYPE   0 diagram calls  (two edits into the draft textarea)
after PRESS  1 diagram call   ["POST /api/workspace-docs/diagram"]
after SWITCH 1 diagram call   [... , "GET /api/workspace-docs/main/beta.md"]
```

*Discriminator:* the press proves the log captures `/diagram` calls at all; the zeros
before and after it are therefore absences rather than blindness.

## 3. Not done — what is NOT proven

**Failed:** none.

**Not run:** AC-11 only. It was never exercised — it requires the installed 0.12.6
application and a real git repository. Nothing about it was inferred from the machine
results; the byte-level guarantee AC-3 proves at the route is *not* the same claim as
"`git diff` shows only the fence's lines in the packaged app", because the packaged app
runs a vendored bundle and a different client path.

**Proven with a caveat:** none. Every tick above rests on captured output, not testimony.

## 4. Blockers — what stopped verification

None. Both repos were clean before and after; every injection was reverted and the
suites re-run green.

## 5. Needs a human — AC-11

> In the packaged app, ask the AI to change one diagram in a real repo, preview it, save,
> then run `git diff`: only the fence's lines appear as changed.

Exact sequence:

1. Install `release/choda-companion-setup-0.12.6.exe` (built under TASK-1938, not published).
2. Open a **real git repo** with a committed `.md` containing a mermaid fence —
   `C:\dev\mantu\ABCV2\docs\knowledge` is the origin of this whole task. Confirm
   `git status` is clean before you start.
3. Docs pane → open that file → press **Edit** on the diagram.
4. Type an instruction, press **Ask AI**, wait for the preview to draw.
5. Press **Save** and accept the confirm.
6. Run `git diff` on that file.

**Pass:** only the fence's own lines appear in the hunk.
**Fail:** the whole file shows as modified — the BOM or line-ending defect surfacing in
the packaged build where no test can see it. This is the same defect class TASK-1938's
AC-2 is still holding open, so one session at the app can discharge both.

## 6. Steps — what was actually done, in order

1. `ac_review(TASK-1931)` → 11/11 `ok`, no concerns. Recorded as a second reading, not a gate.
2. Read the diff and the sources — `workspace-docs.ts` (PUT + etag), `mermaid-check.ts`
   (both routes), `FenceEditor.tsx`, `CaptureMarkdown.tsx`, `api.ts`.
3. Wrote an independent adapter driver booting a real server on port 0 with a temp
   workspace, a temp data dir, and a recording `fetchImpl`. Nine blocks, AC-1…AC-9.
4. First run: 8 passed, AC-4 timed out at 15 s. **Cause: the cold dynamic import of
   mermaid**, not a defect — re-run with a 120 s budget completed in 855 ms warm.
   (See Findings — this is a real first-call latency in the product, not just in a test.)
5. Full green: 9/9.
6. **Injection 1** — made the PUT unconditional (dropped the `if-match` requirement and
   the hash comparison). AC-1 and AC-2 both went red, exactly as the task's Test Plan
   predicts. Reverted via `git checkout --`.
7. **Injection 2** — returned the model's answer without `checkMermaid`. AC-6 went red
   with `200 {"mermaid":"this is not mermaid at all","attempts":1}`; AC-7 went red too,
   at its own stated fail condition. Reverted.
8. Re-ran clean: 9/9 green, `git status` clean.
9. Wrote a second driver for AC-10 in the web package. Two rejected attempts first —
   see Findings.
10. AC-10 green with the full call log.
11. Deleted both drivers; confirmed both repos clean.

**Rejected attempts, recorded so nobody repeats them:**

- *Default-importing `WorkspaceDocsView`* — it is a named export. Failed loudly, cost one run.
- *Stubbing `MermaidBlock` with an `onEdit` prop* — the real prop is
  `edit={{ label, onEdit }}`, passed from `CaptureMarkdown` only when `fenceAtLine`
  resolves the fence. A stub with the wrong prop shape renders **no edit button at all**,
  and the test would have failed as "cannot find the control" while looking like the
  feature was missing. Worth knowing: the edit affordance depends on remark position
  data surviving to `CaptureMarkdown`.

## 7. Findings

⚠️ **CORRECTED 2026-09-13 — the ~36 s cold start does NOT apply to the shipped app.**

This finding originally read: *"First `/diagram/check` on a cold process takes ~36 s … the
cost lands on the user's first diagram check in the packaged app."* **That attribution was
wrong**, and it was wrong because the number was measured under vitest and never against
the adapter that ships.

Measured properly while working TASK-1941 (a real adapter process, real HTTP, three runs each):

| | bundled — what ships | external — what vitest does |
|---|---|---|
| cold process, warm FS cache | **64–71 ms** | 874–909 ms |
| cold process + cold FS cache | ~71 ms | **71,111 ms** |
| second call onward | 8–10 ms | 7–11 ms |

The 36 s was real but it measured the **un-bundled** path: vitest resolves mermaid from
`node_modules` across 99 MB of loose files, which is the *external* build option, not the
packaged one. esbuild inlines mermaid into `companion-server.cjs`, so the shipped app pays
**64–71 ms**, and there is no user-facing warm-up to signal.

The dynamic import remains deliberate and correct (`mermaid-check.ts`: a process that never
validates a diagram never evaluates the module). What changed is only who pays for it.

The original mistake is left visible rather than deleted, because the lesson is the reusable
part: a number measured in the test environment was written into two records as a property of
the product, and checking it against a real process took four minutes. See TASK-1941 for the
full measurement; these figures are what decided that task in favour of bundling.

⚠️ **One unexplained red under injection 1, cause NOT captured.** On the first injected
run AC-8 also failed; on a re-run under the identical injection it passed and only
AC-1/AC-2 failed. Nothing in AC-8's path relates to the `if-match` precondition, so the
injection does not explain it.

**What is not known:** the assertion message was never captured, so whether this was a
500 from the route — the signature of **TASK-1942** — or something else entirely is
unestablished. It is recorded here as an unexplained non-determinism, not as a TASK-1942
sighting. Two details do make it worth chasing: it appeared in a **single-file** run,
whereas TASK-1942's ticket states the failure "only happens in the full parallel suite",
and the file does drive `PUT /workspace-docs`. If it is the same bug, that premise in
TASK-1942 is wrong and its AC-1 repro strategy (loop the full suite) would be looking in
the wrong place. Re-running the deleted driver in a loop with the throw logged would
settle it cheaply.

- `listMermaidFences` correctly keeps `\r` in the fence body (commented as deliberate),
  which is what makes AC-3's guarantee hold through the *reader* as well as the writer.
  This is the load-bearing detail TASK-1937's handoff flagged, and it survives.
- The adapter's `handleDiagramProposal` locates the fence **before** reading the key —
  so AC-9's "no provider calls" is structural, not incidental.
- AC-8's control is the pattern worth copying: five criteria in this task are about calls
  that must *not* happen, and only the control distinguishes "nothing was sent" from
  "nothing was recorded".
