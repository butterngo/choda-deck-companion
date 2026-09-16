---
type: learning
title: A proof must drive the shipped code path, not a copy of it
projectId: choda-deck
workspaceId: choda-deck-companion
scope: project
refs:
  - path: electron/display-media.cjs
    commitSha: 085f9a7da9b07f417b9735af40a90389647b1694
  - path: scripts/proof-loopback.cjs
    commitSha: 085f9a7da9b07f417b9735af40a90389647b1694
createdAt: 2026-09-16
lastVerifiedAt: 2026-09-16
---

**Trigger:** you are writing a script or a test to prove something the shipped code
does, and the thing you need to exercise is buried inline — a callback defined in the
middle of `main.cjs`, a handler declared inside a boot sequence. The convenient move
is to write the same few lines into the proof and run those.

**Context.** TASK-1964 had to prove that `setDisplayMediaRequestHandler` really yields
the remote party's audio on this machine. The handler was 12 lines inline in
`electron/main.cjs`. Copying those lines into the proof script would have run
correctly, printed PASS, and proven nothing about the application: the copy and the
original are free to drift from the moment they exist, and nothing detects it. The
proof would then keep passing while the app was broken — the failure mode is silent
and permanent.

**Rule.** When a proof needs a code path, **extract that path into a module the
application imports, and have the proof import the same module.** One definition, two
callers. The extraction is usually smaller than the duplication would have been.

**Resolution in this repo.** `electron/display-media.cjs` exists for exactly this
reason — `main.cjs` installs `createDisplayMediaHandler({ desktopCapturer })` and
`scripts/proof-loopback.cjs` installs the same function. A change to the grant shape
is felt by the proof immediately. The module's header comment says so, so the next
person does not "tidy" it back inline.

**How to spot the violation:** the proof file contains a literal that also appears in
the source file. If you can edit one and the other keeps passing, you have two
implementations and one of them is fiction.

Related: the sibling concern about whether a check can fail at all —
`when-this-operation-fails-does-it-look-different-from-when-it-works` (bpa-engine).
That one asks whether pass and fail differ; this one asks whether you are testing the
real thing. A proof can satisfy either and still fail the other.
