---
requirement: "có thể tôi cần tích hợp thêm mấy cái docker management trên mấy cái project nữa có thể để có nguyên 1 cái journey hoàn thiện"
started: 2026-09-06
workspace: choda-deck-companion
status: stopped-blocked-on-a-decision
---

# Discovery — Docker management across projects

Spike, per `/requirement-analysis` §0: the first question is *may the adapter execute processes at all*, which is a decision rather than a search. Dimensions 1, 2 and 4 are scored in full; 3 and 5 are scored because real measurements were available; 6 and 7 are deferred until the §AC-3 decision is made, and the reason is stated rather than the score inflated.

## Round 1 — Docker management across projects

### New evidence this round

| Source | What it settled | Citation |
|---|---|---|
| code | **The adapter already executes a process.** `execFileSync('git', args, …)` behind an injectable `GitCommitReader` seam | `choda-deck/src/adapters/companion/workspace-commits.ts:23,151` |
| code | The shape of that permission: fixed program name, args as an **array** (no shell), `stdio: ['ignore','pipe','pipe']`, `maxBuffer` 32 MB, **synchronous** | `workspace-commits.ts:151-156` |
| report | The TASK-1830 rejection, verbatim: *"the adapter launching a process — a far larger security step than the file write we just ruled out"*, reason *"contradicts the read-only decision it was meant to satisfy"* | `choda-deck/docs/reports/claude-config-inventory-discovery.md:125` |
| machine | Docker Engine **29.3.0** running; **25 containers** total, 8 or more up for days | measured 2026-09-06 |
| machine | **17 Docker artifacts across 12 projects** under `/c/dev` — compose files and Dockerfiles | `find` measured 2026-09-06 |
| machine | Compose-managed containers carry `com.docker.compose.project` **and `com.docker.compose.project.working_dir`, an absolute path** — the container-to-workspace mapping already exists and needs no invention | `docker ps -a --format` measured 2026-09-06 |
| machine | **8 of 12 sampled containers carry NO compose labels** (started by `docker run`) — a group-by-workspace view leaves a large unattached bucket | same |
| machine | `docker logs --tail N` returns and exits 0 — a bounded read is available | measured |

### Scores

| # | Dimension | Score | Why exactly this — evidence | What it needs to reach 9 |
|---|---|---|---|---|
| 1 | Problem and value | 7 | The surface is real and measured: 25 containers, 17 artifacts, 12 projects. But the requirement is one sentence, and **what Butter actually does by hand today is unrecorded** | Butter naming the two or three actions he repeats — start, stop, tail, restart? |
| 2 | Scope and boundary | 8 | The out-list below is concrete and reasoned | Confirmation that "read plus a bounded restart" is the intended cut, not something wider |
| 3 | Technical contract | 8 | The read half is fully specified from measurement: `docker ps -a --format`, compose labels as the workspace join, `docker logs --tail`. The mutating half is not, because it depends on the §AC-3 decision | the decision, then a lifecycle contract for a long-running command |
| 4 | Prior art and constraints | 9 | The 1830 rejection is read verbatim, the `git` precedent is read in code, and both constraints named in the task were checked | — |
| 5 | Edges and failure | 6 | Named below and several are real, but **none is measured**: a container that will not stop, a compose file that no longer parses, Docker not running at all | probe each against the live daemon |
| 6 | NFR | *deferred* | Long-running processes, streamed output and state outliving a request are the NFRs that matter, and all three are consequences of the §AC-3 decision | the decision |
| 7 | Acceptance criteria | *deferred* | Cannot be written against a contract whose mutating half does not exist yet. §3d's own rule: fix dimension 3 before 7 | the decision |

**TOTAL = MIN = 6** (dimension 5)
Round 1 of 1. New evidence? **YES** — 8 sources.

### Score history

| # | Dimension | R1 |
|---|---|---|
| 1 | Problem and value | 7 |
| 2 | Scope and boundary | 8 |
| 3 | Technical contract | 8 |
| 4 | Prior art and constraints | 9 |
| 5 | Edges and failure | 6 |
| 6 | NFR | deferred |
| 7 | Acceptance criteria | deferred |
| | **MIN** | **6** |

### Stop condition

**Blocked on a human decision** — `/requirement-analysis` §5, which names this as the loop working rather than failing. Searching harder cannot produce the answer to §AC-3; it is a permission Butter grants or withholds. A round 2 would be theatre.

---

## AC-3 — may the adapter execute processes at all?

**The blanket question is already settled by fact, and this task's own premise was wrong.**

TASK-1840's body states *"Nothing in the adapter has ever shelled out to another program."* That is false, and I wrote it. `src/adapters/companion/workspace-commits.ts:151` has been calling `execFileSync('git', …)` since the History tab shipped. Every commit, diff and changed-file list the companion has ever shown came out of a spawned process.

So *"the adapter must not launch a process"* was never the rule. **The real rule is visible in the shape of that one call site, and it is narrower and far more useful:**

| Property of the existing permission | Why it is there |
|---|---|
| Fixed program name, never composed | nothing user-supplied selects the binary |
| Args as an **array**, never a string | no shell, therefore no shell injection |
| `stdio: ['ignore', …]` | no stdin; the child cannot be driven |
| `maxBuffer` capped at 32 MB | a runaway child cannot exhaust memory |
| Behind an injectable interface | every failure path is testable without the machine |
| **Read-only** — `log`, `show`, `numstat`, `rev-parse` | git is asked questions; it is never asked to change anything |
| **Synchronous** | acceptable only because each call is bounded and fast |

**The 1830 rejection's stated reason has since been overturned by a different task.** It read *"contradicts the read-only decision it was meant to satisfy"* — and TASK-1844 deliberately reversed that read-only decision. The pane writes files now, under `if-match`, with a diff the reader approves. The rejection's premise is gone.

Its other half still stands and is not addressed by that: *"a far larger security step."* Launching an **editor** is arbitrary-program execution chosen by configuration. That is genuinely different from asking `git` a question, and refusing it remains right.

**The proposal, which is Butter's to accept or refuse:**

> The adapter may execute **`docker`** under exactly the constraints it already applies to `git` — fixed program, array args, no shell, no stdin, capped buffer, behind an injectable seam — for the **read-only** subcommands `ps`, `logs --tail`, `inspect` and `compose config`.
>
> **Mutating subcommands are a separate decision and are not proposed here.** `start`, `stop`, `restart`, `down` and `up` change machine state that outlives the request, and two of the seven properties above — synchronous, bounded — do not survive them.

The read half needs no new permission category: it is the `git` precedent with a second binary. The mutating half needs a category this app does not have, which is exactly why it must not be smuggled in beside the read half.

---

## AC-2 — what is OUT

Named because the requirement arrived as an in-list with no boundary.

| Out | Why |
|---|---|
| `up` / `down` / `start` / `stop` / `restart` | mutating, and gated on a decision not yet made — see §AC-3 |
| Building images | minutes long, produces output nothing in this route shape can stream, and is what a terminal is for |
| Streaming logs (`docker logs -f`) | an open stream outliving a request; no route in this app has ever done that. `--tail N` is a bounded read and is IN |
| `exec` into a container | arbitrary command execution inside a container is strictly larger than the editor launch already refused |
| Editing compose files from the Docker view | the Setup pane's editor already writes files with `if-match` and an approved diff; a second write surface is a second place to get CRLF and BOM wrong |
| Remote contexts, Swarm, Kubernetes | the local daemon is the measured surface; nothing else was observed |
| Registry credentials, `docker login` | secret-carrying, and `secret-carrying-capture-kinds-are-local-only-never-inbox-task` governs |
| Attributing unlabelled containers to a workspace | **8 of 12 sampled carry no compose labels.** They can be listed; they cannot be attributed, and inventing an attribution would render a guess as a fact |

## Edges named but NOT measured — dimension 5's gap

Each is a real failure mode and none was probed, which is why 5 scores 6 rather than 8. This section is the gap, stated rather than left implicit.

- **Docker not running.** The CLI exists and the daemon does not. Must degrade to a capability note — the same stance as an unconfigured model, not an error.
- **A compose file that no longer parses.** `docker compose config` fails; the project must still list its containers.
- **A container that will not stop.** Only matters once mutation is in scope, and is the strongest single argument for keeping it out of the read half.
- **25 containers and growing.** `docker ps -a` cost was not timed. TASK-1859 AC-7 is the precedent: measure it before designing around it.
- **A workspace with no containers.** Must read as "none running", not as an empty pane — the distinction the Setup verdict strip exists to make.

## Unproven assumptions carried forward

- Assumed: `com.docker.compose.project.working_dir` matches a registered workspace `cwd` **exactly**. Both are absolute Windows paths, but case and separator normalisation were not tested.
- Assumed: Butter wants this per workspace rather than as one global container list. *"trên mấy cái project"* points at per workspace, but was not confirmed.
- Assumed: `docker ps -a` over 25 containers is fast enough to run on open. Unmeasured.

## The question that unblocks this

> **May the adapter run `docker` read-only — `ps`, `logs --tail`, `inspect`, `compose config` — under the same constraints it already runs `git`?**
>
> And separately: **should mutating commands be in scope at all**, or is starting and stopping containers something you would rather keep in a terminal?

A yes to the first alone is enough to write a task. The second changes the shape of the feature and needs its own answer.
