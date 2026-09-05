# TASK-1849 — AC verification

**Release the editor and confirm a save changes only the lines that changed**

Attended run · 2026-09-05 · workspace `choda-deck-companion`
Release: 0.9.6, PR #103, squash `a8d36bd`, proven ancestor of `origin/main`
Adapter source: `choda-deck` `e29c4c2`
Also landed: `choda-deck` PR #268, squash `33a3e98` — the TASK-1842 and TASK-1843 AC reports, uncommitted since the chain ran

## Done — 1 of 3

| AC | Class | Proven by | Discriminator |
|---|---|---|---|
| AC-1 | machine | `cmp` of `choda-deck/dist/companion-server.cjs` against **both** `electron/vendor/companion-server.cjs` and `release/win-unpacked/resources/adapter/companion-server.cjs` exits 0; all three carry sha256 `401ef038…46c749`. Routes inside the packaged bundle: `/claude-config/validate` ×1, `/claude-config/review` ×1, and the `PUT` guard verbatim | Checked at the packaged path, not only the staging one. Vendoring correctly and then packaging something else is the failure a `electron/vendor/` check alone cannot see |

`verify-release-manifest` reports `latest.yml` matches `package.json` 0.9.6 and the installer bytes on disk. Installer: `release/choda-companion-setup-0.9.6.exe` (189.9 MiB).

## Not done — 2, both human

**AC-2** — edit a `SKILL.md` in the packaged app, save, run `git diff`, confirm only the edited line appears.
**AC-3** — same file open in two windows; save from one, then the other; the second must be refused with "changed on disk" and keep its text.

Neither can be proven from test output, which is the whole reason they were split out of TASK-1844 rather than ticked there. **TASK-1849 stays at IMPLEMENTED.**

## Findings

**A belief carried across a repo boundary was wrong again, and waiting caught it.** I expected `choda-deck`'s path filters to give a docs-only PR zero checks, and said so before opening #268. Three jobs registered. Had I merged on the count I predicted, it would have been iteration 1's mistake repeated — that time the rollup genuinely was 0 twenty seconds before it was 3. The rule that survives both: read the rollup after it has had time to appear, then watch it; never merge on a *prediction* about which checks apply.

**AC-1 was verified at two paths, and only the second one is the criterion.** `pnpm run vendor:adapter` copies into `electron/vendor/`, but what ships is `resources/adapter/` inside `win-unpacked` — electron-builder's `extraResources` mapping sits between them, and that mapping is exactly where a rename bug would hide. Both were compared; both are byte-identical. Checking only the staging directory would have proven the copy, not the release.

**The installer is unsigned**, as 0.9.3–0.9.5 were. `verify-signature` reports it and does not fail the build: no CA certificate is configured, so SmartScreen will say "Unknown publisher" and need *More info → Run anyway*. Unchanged from every prior build, stated here so it is not read as new.

**What this release means, in one line:** every route TASK-1841, TASK-1842 and TASK-1843 built existed only on `choda-deck` main until now. The web UI that calls them shipped in 0.9.5's successor with nothing to talk to. As of 0.9.6 both halves are in one installed app for the first time.

## Next

Install 0.9.6 and run AC-2 and AC-3. When both hold, tick them here, set TASK-1849 DONE, and TASK-1844's AC-6 — the criterion this task carries forward — can be ticked too, taking TASK-1844 from IMPLEMENTED to DONE and closing the TASK-1839 epic.
