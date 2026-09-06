# TASK-1875, 1877, 1878, 1879 — AC verification

**Look inside a container · a socket · a shell · a terminal**

Autonomous run · 2026-09-06 · two repos
Merged, all proven ancestors: companion #121 `6759e0c`, #122 `016b94d`, #123 `f9b9cb5`, #124 `d939087` · `choda-deck` #277 `faf7828`, #278 `376499a`, #279 `8f91a70`
Release: **0.12.0**, packaged adapter byte-identical to the build (`cmp`), sha256 `d784332d…cf8da4c9`
Gates via each repo's own scripts: `choda-deck` 1991 passed · companion 584 web + 79 electron
CI: green on **both ubuntu and windows**

## TASK-1875 — container files. Done, 7 of 7

| AC | Discriminator that makes it worth having |
|---|---|
| AC-1 | A GNU line *and* a busybox line in one test — busybox prints numeric uid/gid, which is what Butter asked to see, and pads differently. The raw line survives, so a parse failure cannot make a file disappear |
| AC-2 | The dash and the metacharacters asserted with **opposite** outcomes in one describe |
| AC-3 | 404 and 409 both assert the spawn log is **empty** — resolved before any argv exists |
| AC-4 | 413 asserts `body.text` is **undefined**: no truncated body pretending to be the file |
| AC-5 | The whole body asserted against `/docker|OCI|runtime/i`, and the spawner never captures stderr, so it cannot leak by accident |
| AC-6 | argv asserted **whole** — `toContain` passes with a flag appended |
| AC-7 | Up walks `/app/src` to `/app`, a **two-level** test; a `parentOf` that always returned root would pass a one-level one |

**The rule that looks backwards and is not.** `;`, `&&` and `$(...)` are **accepted** and passed through, with a test asserting it. There is no shell — execFile takes an array — so those are characters in a filename. Rejecting them breaks real files and prevents nothing. The one real rule is that a path must never become a **flag**.

## TASK-1877 — the socket. Done, 6 of 6

| AC | Discriminator |
|---|---|
| AC-1 | The echo is asserted, not the open. A socket that handshakes and never answers is open and dead |
| AC-2 | `socket.destroyed` on a **raw net socket** — the `ws` client swallows the error once `unexpected-response` is handled, and a half-open door looks identical from the client |
| AC-3 | A stub adapter behind the real proxy records the header it received; bytes cross **after** the handshake, both ways |
| AC-4 | **Ten** opens and closes leave `openCount` at 0; one would pass against a set that never deletes |
| AC-5 | The existing suite ran unchanged — 1971 to 1981, zero edits to any existing test file |
| AC-6 | The module's own source asserted free of `child_process`, `node-pty`, `spawn` |

## TASK-1878 — the shell. 5 of 7, and the two gaps are deliberate

| AC | Discriminator |
|---|---|
| AC-1 | A marker echoed **through** a real shell — input arriving *and* output returning |
| AC-2 | A **recording** spawner (the one deliberate exception to the real-PTY rule), plus a control proving the refusal is not blanket |
| AC-3 | The pid asserted gone **against the OS**, not that a handler ran |
| AC-4 | The **shell** is asked its width after a resize and reports 132 — a spy on `resize()` cannot see "accepted and ignored" |
| AC-5 | The exit **code**, not merely the fact |

### AC-6 not ticked — the plan was wrong, and the AC was not reworded to hide it

> node-pty is listed in both `VENDORED_DEPS` and `NATIVE_MODULES_TO_REBUILD` … Fail: it is vendored unrebuilt, which is `ERR_DLOPEN_FAILED` in the installed app.

Running the vendor script disproved the premise, twice:

1. node-pty builds on `node-addon-api` — **N-API**, an ABI stable across Node *and* Electron. `better-sqlite3` is a V8/NAN addon, which is why **it** needs the rebuild.
2. Rebuilding is impossible anyway: the published tarball omits `deps/winpty/src/shared/GetCommitHash.bat`, so gyp dies at configure.

Rewording the criterion to match what was built is the drift the planning rules exist to prevent, so it stays unticked and became **TASK-1888** for a decision. The *intent* behind it is proven below.

### AC-7 not ticked — human, but the native half is now ruled out

The **shipped** node-pty, loaded under the **shipped** Electron binary from the packaged `resources/adapter` tree, spawned a real shell: `ok=true exit=0`. The "green in `pnpm test`, dead in the installer" failure this AC exists for cannot happen. What remains is whether keys land right, which needs a human.

**TASK-1878 stays at IMPLEMENTED.**

## TASK-1879 — the terminal. 6 of 7

| AC | Discriminator |
|---|---|
| AC-1 | Three keystrokes produce **three** frames, asserted whole and in order. Line buffering yields one carrying the whole line |
| AC-2 | The **numbers** — 137x41, then 200x60 — plus a fallback case that must not send NaN |
| AC-3 | `disableStdin` asserted true on exit **and false on a live shell**, so the flag means something |
| AC-4 | The socket asserted closed on unmount — the half that makes TASK-1878 AC-3 fire |
| AC-5 | Nothing crosses a closed socket; `start` is first; held keystrokes arrive **in order** |
| AC-6 | A clean exit asserted **not** to render the failure message — two facts, two renderings |

**A bug found in existing code.** The tab strip labelled tabs with a chain of ternaries ending in a bare `"Docker"` fallback, so the sixth tab silently rendered as "Docker" — the same two-lists drift TASK-1865 fixed for the `?tab=` parse, recurring in the label. Now `Record<Tab, string>`, and a missing entry was verified to produce `error TS2741`.

**On mocking xterm.** jsdom has no canvas, so the real xterm reports its 80x24 default whatever the pane is — asserting against it would pass equally well against the hardcoding AC-2 forbids. The mock is what makes the criterion falsifiable, not what weakens it.

## Injections — twelve, each landing where it should

| Injection | Red |
|---|---|
| Reject `;` in a container path | 1 |
| Allow a leading dash | 1 |
| `parentOf` always returns root | 1 |
| Conflate empty directory with error | 1 |
| Refuse an upgrade without destroying | 3 — they **hang**, which is the half-open door |
| Never delete from the open socket set | 2 |
| Handshake but pipe nothing back | 1 |
| Drop the token on the upgrade | 1 |
| Accept any `cwd` | 1 |
| Fixed 80x24 | 2 |
| Socket left open on unmount | 2 |
| Input buffered until Enter | 1 |

## Findings

**CI caught a test that was wrong about its own environment.** node-pty ships prebuilds for win32 and darwin only; on Linux four criteria failed for a reason unrelated to the code. They are now skipped **with the reason named and logged**, and the skip was verified to engage by forcing the probe false — 6 passed, 4 skipped, not 10 passed. A green tick on a machine that could not run the shell is worse than a red one.

**A vendor step that is never run is a claim, not a fact.** Both node-pty findings came from executing `vendor:adapter`, not from reading its manifest. The first attempt also demanded `node-addon-api` be staged, because node-pty's `binding.gyp` shells out to it at configure — a dependency no manifest would have suggested.

**Three criteria were kept honest by refusing to tick them.** AC-6 above, plus the three human AC-7s. Ticking AC-6 on the Electron-runtime evidence would have quietly asserted a mechanism that is false for this module.

## A process mistake, recorded

**I forgot `session_start` before ticking TASK-1878 AC-1**, so its evidence is bound to `SESSION-1786527042281-1` — an unrelated 2026-08-12 spike. **The third time in this conversation.** AC-2 through AC-5 are bound correctly. `ac_check` refuses to re-record, so the misbinding stands and is named here rather than left for someone to trip over.

## Open

- **TASK-1875 AC-7, TASK-1878 AC-7, TASK-1879 AC-7** — need a human at the installed 0.12.0
- **TASK-1888** — the decision AC-6 needs
- The installer is **unsigned** (pre-existing, no certificate): SmartScreen will say "Unknown publisher"
- node-pty's conpty helper prints `AttachConsole failed` to stderr on kill — noise, not a failure, and unexplained
