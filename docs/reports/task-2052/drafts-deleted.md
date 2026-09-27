# TASK-2052 AC-7: the 11 draft releases, deleted 2026-09-27

Decision (Butter, 2026-09-27): delete all 11. Every draft is older than v0.18.1, which is published and is what the feed serves. A draft is invisible to electron-updater, so none of them could ever reach a client. v0.6.1, v0.6.2 and v0.1.0 each also have a published release, which is kept. The drafts on those tags were leftovers from a manual re-upload.

Consequence, accepted: the installers attached only to these drafts (0.17.1, 0.15.0, 0.13.0, 0.2.0, 0.0.1) are gone. v0.17.1 is the only one that was complete.

Snapshot taken just before deletion (`gh api .../releases`, `draft==true`):

| Tag | Release id | Created | Assets (bytes) |
|---|---|---|---|
| v0.17.1 | 392374578 | 2026-09-20 | choda-companion-setup-0.17.1.exe (211053690)<br>choda-companion-setup-0.17.1.exe.blockmap (217442)<br>latest.yml (362) |
| v0.15.0 | 391452079 | 2026-09-18 | choda-companion-setup-0.15.0.exe.blockmap (218189) |
| v0.15.0 | 391452056 | 2026-09-18 | choda-companion-setup-0.15.0.exe (211024524)<br>latest.yml (362) |
| v0.13.0 | 389965992 | 2026-09-16 | choda-companion-setup-0.13.0.exe (210995200)<br>latest.yml (362) |
| v0.13.0 | 389965994 | 2026-09-16 | choda-companion-setup-0.13.0.exe.blockmap (217446) |
| v0.6.2 | 374927727 | 2026-08-22 | choda-companion-setup-0.6.2.exe (195938525)<br>latest.yml (359) |
| v0.6.1 | 370928547 | 2026-08-15 | choda-companion-setup-0.6.1.exe (100179523)<br>latest.yml (359) |
| v0.2.0 | 361076588 | 2026-07-28 | choda-companion-setup-0.2.0.exe.blockmap (103113) |
| v0.2.0 | 361076591 | 2026-07-28 | choda-companion-setup-0.2.0.exe (100125846)<br>latest.yml (359) |
| v0.1.0 | 360928926 | 2026-07-28 | choda-companion-setup-0.1.0.exe.blockmap (103175) |
| v0.0.1 | 358470892 | 2026-07-23 | choda-companion-setup-0.0.1.exe (108422966)<br>choda-companion-setup-0.0.1.exe.blockmap (114846)<br>latest.yml (359) |
