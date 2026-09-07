---
type: gotcha
title: Three obligations when touching the terminal pane — keys, size, and identity
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: packages/web/src/components/WorkspaceTerminal.tsx
    commitSha: 466ee43c2afc445ee0dadb35693466c9ca4ae43e
createdAt: 2026-09-07
lastVerifiedAt: 2026-09-07
affectedFeatureId: feature-companion-ui
---

**Trigger:** you are changing the terminal pane's layout, keybindings, or lifecycle — adding fullscreen, a split, a toolbar, a tab. Each of the three below is silent when broken and looks like a different bug than it is.

## Context

`WorkspaceTerminal` renders xterm over the `/terminal` WebSocket, with a real PTY behind it. It sits beside `DockerLogs`, which is a *pane of text* — and copying that component's patterns wholesale is how two of these three get broken.

## Business rule

**1. Escape belongs to the shell. Do not bind it.**

`DockerLogs` leaves fullscreen on Escape, and for a log pane that is correct — it has no other use for the key. A terminal is the opposite case: Escape leaves insert mode in vim, cancels a completion, dismisses a prompt. **Single keys reaching the program is the entire reason a PTY was chosen over a command runner** (TASK-1876).

Use a chord no shell claims — `Ctrl+Shift+F` here — and **name it on the button**, because Escape is what a reader tries first and it must visibly do nothing.

The test has two halves: Escape does not close the overlay, *and* it arrives as an `in` frame unaltered. Not eating it is worthless if it never arrives.

**2. Any layout change must re-measure and send `size` — in BOTH directions.**

The CSS is not the feature; telling the shell is. A pane that grows without a `size` frame leaves `vim` redrawing inside the old grid on a screen twice that size — which reads as a **broken terminal**, not a missing feature. Handing the small grid back on the way out matters exactly as much.

Assert the **numbers** in the frame. "A size frame was sent" is true of a component that hardcodes 80×24.

**3. The host element must keep its identity.**

The terminal and its socket are built in an effect keyed on the workspace. If a state change remounts the host, xterm is disposed and the socket closes — and the adapter kills the PTY when the socket closes (TASK-1878 AC-3). **Going fullscreen would end the shell you went fullscreen to look at.**

So: the overlay is *the same element with a different `className`*, never a different element, and the fullscreen flag stays out of that effect's dependency array.

Assert socket and terminal **identity** (`toBe`) across the toggle, plus that no second `start` frame was sent. Existence would be satisfied by a fresh socket that replaced a dead one.

## Resolution

Keep the three tests that pin this — they are cheap and each one caught its injection: binding Escape (1 red), toggling without re-measuring (2 red), adding the flag to the effect's deps (3 red, including the identity test).

**On mocking xterm:** the component tests mock `@xterm/xterm` and the fit addon deliberately. jsdom has no canvas, so the real xterm reports its 80×24 default whatever the pane is — asserting against it would pass equally well against the hardcoding rule 2 forbids. The mock is what makes the criterion falsifiable, not what weakens it.

## Related

- TASK-1879 (the pane), TASK-1889 (fullscreen), TASK-1876 (why a PTY at all)
- The pattern it deliberately diverges from: `DockerLogs` (TASK-1872)
- Focus restore belongs in a post-commit effect, never inside the handler — the 0.9.7 bug
