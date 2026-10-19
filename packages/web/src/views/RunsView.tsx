// TASK-2532 — "Runs": what each /choda-autopilot or /choda-burn-backlog run
// finished, what it tested and what it left for Butter, grouped by project.
// Butter, 2026-10-19: "làm sao để biết được xong task nào, đã test những gì,
// còn gì". Agreed mockup: https://claude.ai/artifact/XG9UJ3bPmQERJaaZTaf8uM
//
// The decide screen shows a run's notices and forgets them on dismiss; this
// screen joins them with the goal's items, commits, criteria and test lines
// (GET /runs). An item row opens the task page, where the translate button is.
// The dependency flow per run is RunFlow (TASK-2538).

import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { Run, RunItem, RunNotice, RunStage, RunState } from "../api";
import type { HealthView } from "../hooks/use-health";
import { useRuns } from "../hooks/use-runs";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";
import { RunFlow } from "../components/RunFlow";

type Filter = "all" | "running" | "finished" | "halted";

const STATE_PILL: Record<RunState, { label: string; icon: string; cls: string }> = {
  running: { label: "Running", icon: "ti-loader-2", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  finished: { label: "Finished", icon: "ti-circle-check", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  halted: { label: "Halted", icon: "ti-alert-triangle", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  "waiting-merge": { label: "Waiting for merge", icon: "ti-git-pull-request", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  idle: { label: "Idle", icon: "ti-player-pause", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
};

const STAGES: { id: RunStage; label: string }[] = [
  { id: "started", label: "Started" },
  { id: "working", label: "Working" },
  { id: "pr-opened", label: "PR opened" },
  { id: "merged", label: "Merged" },
  { id: "done", label: "Done" },
];

const DONE_STATUSES = ["IMPLEMENTED", "DONE"];
const isDone = (i: RunItem): boolean => DONE_STATUSES.includes(i.status);

function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${hhmm(iso)}`;
}

/** Which bucket a filter chip puts a run in. Waiting for merge and idle count as running work. */
function bucket(state: RunState): Exclude<Filter, "all"> {
  if (state === "finished") return "finished";
  if (state === "halted") return "halted";
  return "running";
}

function Stepper({ run }: { run: Run }): React.JSX.Element {
  const done = run.items.filter(isDone).length;
  const at = STAGES.findIndex((s) => s.id === run.stage);
  return (
    <ol aria-label="Run stage" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STAGES.map((s, k) => {
        const state =
          run.failedAt === s.id
            ? "failed"
            : k < at || (run.stage === "done" && k === at)
              ? "done"
              : k === at
                ? "current"
                : "todo";
        const cls = {
          done: "text-zinc-600 dark:text-zinc-300",
          current: "text-blue-700 dark:text-blue-300 font-medium",
          failed: "text-rose-700 dark:text-rose-400 font-medium",
          todo: "text-zinc-400",
        }[state];
        const icon = { done: "ti-circle-check", current: "ti-loader-2", failed: "ti-circle-x", todo: "ti-circle-dashed" }[state];
        return (
          <li key={s.id} data-step={s.id} data-state={state} className={`flex items-center gap-1 ${cls}`}>
            {k > 0 && <span aria-hidden="true" className="mr-1 h-px w-4 bg-zinc-300 dark:bg-zinc-700" />}
            <i className={`ti ${icon}`} aria-hidden="true" />
            {s.label}
            {s.id === "working" && run.items.length > 0 && (
              <span className="text-zinc-400 font-normal">
                {done}/{run.items.length}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ItemRow({ item }: { item: RunItem }): React.JSX.Element {
  const navigate = useNavigate();
  const open = (): void => {
    void navigate(`/tasks/${encodeURIComponent(item.id)}`, { state: { from: { to: "/runs", label: "Runs" } } });
  };
  const status = item.activeSince ? "In progress" : isDone(item) ? "Implemented" : item.status === "TODO" || item.status === "READY" ? "Waiting" : item.status;
  return (
    <tr
      data-testid={`run-item-${item.id}`}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
      className="cursor-pointer border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 align-top"
    >
      <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{status}</td>
      <td className="px-3 py-1.5 whitespace-nowrap font-mono text-xs text-zinc-500">{item.id}</td>
      <td className="px-3 py-1.5 min-w-[14rem]">{item.title}</td>
      <td data-col="commit" className="px-3 py-1.5 whitespace-nowrap font-mono text-xs text-zinc-500">
        {item.commit ? item.commit.split(" ")[0] : "—"}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
        {item.ac.ticked}/{item.ac.total}
      </td>
      <td className="px-3 py-1.5 min-w-[12rem] text-zinc-600 dark:text-zinc-300">
        {item.activeSince ? (
          <span className="text-blue-700 dark:text-blue-300">working since {hhmm(item.activeSince)}</span>
        ) : (
          item.tests?.passed[0] ?? ""
        )}
        {item.tests?.skipped.map((s) => (
          <span key={s} className="block text-[11.5px] text-zinc-400">
            skipped: {s}
          </span>
        ))}
      </td>
    </tr>
  );
}

function Timeline({ notices }: { notices: RunNotice[] }): React.JSX.Element {
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer text-zinc-500">
        Timeline · {notices.length} notice{notices.length === 1 ? "" : "s"}, kept after dismiss
      </summary>
      <ol className="mt-1.5 flex flex-col gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap gap-x-3">
            <time className="font-mono text-[11.5px] text-zinc-400">{when(n.createdAt)}</time>
            <span className="min-w-0 flex-1">{n.title}</span>
            {n.status === "archived" && <span className="text-[11px] text-zinc-400">dismissed</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function RunCard({ run }: { run: Run }): React.JSX.Element {
  const [open, setOpen] = useState(run.state === "running");
  const pill = STATE_PILL[run.state];
  const done = run.items.filter(isDone).length;
  const human = run.items.flatMap((i) => i.ac.humanOpen.map((c) => `${i.id} · ${c}`));
  return (
    <article
      data-testid={`run-${run.goal.id}`}
      data-state={run.state}
      className="rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <i className={`ti ti-chevron-right text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        <span className="font-mono text-xs text-zinc-500">{run.goal.id}</span>
        <span className="min-w-0 font-medium">{run.goal.title}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pill.cls}`}>
          <i className={`ti ${pill.icon}`} aria-hidden="true" />
          {pill.label}
        </span>
        <span className="ml-auto text-xs text-zinc-400">{when(run.lastActivityAt)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 px-3 py-3">
          <Stepper run={run} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="text-zinc-700 dark:text-zinc-200">
              {done} of {run.items.length} done
            </span>
            {run.prUrls.length > 0 ? (
              run.prUrls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  <i className="ti ti-git-pull-request" aria-hidden="true" />
                  {u.replace(/^https:\/\/github\.com\//, "")}
                </a>
              ))
            ) : (
              <span className="inline-flex items-center gap-1">
                <i className="ti ti-git-pull-request" aria-hidden="true" />
                PR not opened yet
              </span>
            )}
          </div>
          {/* TASK-2538 — the dependency flow, above the table it summarises. */}
          <RunFlow items={run.items} />
          {run.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    <th className="px-3 py-1">Status</th>
                    <th className="px-3 py-1">Task</th>
                    <th className="px-3 py-1">Title</th>
                    <th className="px-3 py-1">Commit</th>
                    <th className="px-3 py-1">AC</th>
                    <th className="px-3 py-1">Tests</th>
                  </tr>
                </thead>
                <tbody>
                  {run.items.map((i) => (
                    <ItemRow key={i.id} item={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <section aria-label="Waiting on you" className="text-[12.5px]">
            <h4 className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Waiting on you</h4>
            {human.length > 0 ? (
              <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                {human.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-400">Nothing</p>
            )}
          </section>
          <Timeline notices={run.notices} />
        </div>
      )}
    </article>
  );
}

function Chip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px]",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
      ].join(" ")}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function RunsView(): React.JSX.Element {
  const health = useOutletContext<HealthView | undefined>();
  const { data, isLoading, isError } = useRuns();
  const [filter, setFilter] = useState<Filter>("all");

  function body(): React.JSX.Element {
    if (health?.conn === "disconnected") {
      return <ErrorState variant="unreachable" description="Couldn't read the runs — this is not 'no runs'." />;
    }
    if (isError) return <ErrorState variant="failed" subject="the runs" />;
    if (isLoading || !data) return <Skeleton shape="list" label="Loading…" />;
    if (data.runs.length === 0 && data.otherNotices.length === 0) {
      return (
        <EmptyState
          icon="ti-player-play"
          title="No runs yet"
          description="A run appears here once /choda-autopilot or /choda-burn-backlog files its first notice."
        />
      );
    }

    const counts = { all: data.runs.length, running: 0, finished: 0, halted: 0 };
    for (const r of data.runs) counts[bucket(r.state)]++;
    const shown = data.runs.filter((r) => filter === "all" || bucket(r.state) === filter);

    // Projects in the order of their newest run; runs arrive newest first.
    const projects: { id: string; name: string; runs: Run[] }[] = [];
    for (const r of shown) {
      let p = projects.find((x) => x.id === r.project.id);
      if (!p) projects.push((p = { id: r.project.id, name: r.project.name, runs: [] }));
      p.runs.push(r);
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-6">
        <div role="group" aria-label="Filter runs" className="flex flex-wrap gap-1.5">
          <Chip active={filter === "all"} label="All" count={counts.all} onClick={() => setFilter("all")} />
          <Chip active={filter === "running"} label="Running" count={counts.running} onClick={() => setFilter("running")} />
          <Chip active={filter === "finished"} label="Finished" count={counts.finished} onClick={() => setFilter("finished")} />
          <Chip active={filter === "halted"} label="Halted" count={counts.halted} onClick={() => setFilter("halted")} />
        </div>
        {projects.map((p) => (
          <section key={p.id} aria-label={p.name} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1.5 text-[15px] font-medium">
              <i className="ti ti-folder text-zinc-400" aria-hidden="true" />
              {p.name}
              <span className="text-xs font-normal text-zinc-400">
                {p.runs.length} run{p.runs.length === 1 ? "" : "s"}
              </span>
            </h2>
            {p.runs.map((r) => (
              <RunCard key={r.goal.id} run={r} />
            ))}
          </section>
        ))}
        {filter === "all" && data.otherNotices.length > 0 && (
          <section aria-label="Other loop notices" className="flex flex-col gap-2">
            <h2 className="border-b border-zinc-200 dark:border-zinc-800 pb-1.5 text-[15px] font-medium">
              Other loop notices
            </h2>
            <ul className="flex flex-col gap-1 text-[13px]">
              {data.otherNotices.map((n) => (
                <li key={n.id} className="flex flex-wrap gap-x-3">
                  <time className="font-mono text-[11.5px] text-zinc-400">{when(n.createdAt)}</time>
                  <span className="min-w-0 flex-1">{n.title}</span>
                  {n.workspaceId && <span className="text-[11.5px] text-zinc-400">{n.workspaceId}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <section aria-label="runs" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-lg font-medium">Runs</h1>
        <span className="text-xs text-zinc-400">what your loops finished, tested and left for you, by project</span>
      </div>
      {body()}
    </section>
  );
}
