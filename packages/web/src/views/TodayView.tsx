// TASK-2675 — Today: the landing page. What moved yesterday, every project's
// focus, and what is still outstanding, over GET /daily-report (choda-deck
// TASK-2673), computed live by the adapter.
//
// Butter, 2026-10-23: "daily report kiểu hôm qua xong những gì, hôm nay sẽ làm
// những gì, sẽ scan hết projects phải chắc được việc còn tồn đọng" — and the
// redesign the same day: today is every project's /choda-task-focus, aggregated.
//
// The coverage strip comes first on purpose. "Nothing outstanding" only means
// something when every workspace was actually scanned, so the places the scan
// could not read are named before anything else, never folded into a clean look.

import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { DailyReport, FocusEntry, FocusTier, OutstandingCounts, OutstandingItem, ScanState } from "../api";
import type { HealthView } from "../hooks/use-health";
import { useDailyReport } from "../hooks/use-daily-report";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";

const TIER_ORDER: FocusTier[] = ["session", "in-progress", "pinned", "overdue", "ready", "due-soon"];
const TIER_LABEL: Record<FocusTier, string> = {
  session: "session",
  "in-progress": "in progress",
  pinned: "pinned",
  overdue: "overdue",
  ready: "ready",
  "due-soon": "due soon",
  cold: "no focus",
};

const STATE_LABEL: Record<Exclude<ScanState, "ok">, string> = {
  missing: "folder missing",
  "not-a-repo": "not a git repo",
  failed: "scan failed",
};

const COUNT_LABEL: [keyof OutstandingCounts, string][] = [
  ["implementedNotDone", "implemented, not done"],
  ["inProgressNoSession", "in progress, no session"],
  ["staleSessions", "stale sessions"],
  ["overdue", "overdue"],
  ["rawInbox", "raw inbox"],
  ["dirtyWorkspaces", "dirty workspaces"],
  ["unmergedBranches", "unmerged branches"],
  ["openPrs", "open PRs"],
  ["unscannedWorkspaces", "not scanned"],
];

const projectName = (id: string | null): string => id ?? "No project";

/** How old the git half is (TASK-2705): "scanned just now" under a minute, else "scanned N min ago". */
function scanAge(scannedAt: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(scannedAt)) / 60_000);
  if (min < 1) return "scanned just now";
  if (min < 60) return `scanned ${min} min ago`;
  return `scanned ${Math.floor(min / 60)} h ago`;
}
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section data-testid={id} aria-label={title} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
      <h2 className="mb-0.5 text-sm font-medium">{title}</h2>
      {hint && <p className="mb-2 text-[11.5px] text-zinc-500">{hint}</p>}
      {children}
    </section>
  );
}

function Coverage({ coverage }: { coverage: DailyReport["coverage"] }): React.JSX.Element {
  const unscanned = coverage.workspaces.filter((w) => w.state !== "ok");
  const age = coverage.scannedAt ? ` · ${scanAge(coverage.scannedAt)}` : "";
  if (unscanned.length === 0) {
    return (
      <p data-testid="today-coverage" className="text-[12.5px] text-zinc-600 dark:text-zinc-300">
        <i className="ti ti-circle-check mr-1.5 text-emerald-600" aria-hidden="true" />
        All {coverage.total} workspaces scanned{age}
      </p>
    );
  }
  const groups = (Object.keys(STATE_LABEL) as Exclude<ScanState, "ok">[])
    .map((state) => ({ state, items: unscanned.filter((w) => w.state === state) }))
    .filter((g) => g.items.length > 0);
  return (
    <div
      data-testid="today-coverage"
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <p className="font-medium">
        <i className="ti ti-alert-triangle mr-1.5" aria-hidden="true" />
        Coverage: {coverage.scanned} of {coverage.total} workspaces scanned{age}
      </p>
      <ul className="mt-1 space-y-0.5">
        {groups.map((g) => (
          <li key={g.state}>
            {STATE_LABEL[g.state]}:{" "}
            {g.items.map((w, i) => (
              <span key={w.id}>
                {i > 0 && ", "}
                <span title={w.reason ?? w.cwd}>{w.id}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Yesterday({ yesterday }: { yesterday: DailyReport["yesterday"] }): React.JSX.Element {
  const byProject = new Map<string, DailyReport["yesterday"]["statusChanges"]>();
  for (const c of yesterday.statusChanges) {
    const key = projectName(c.projectId);
    byProject.set(key, [...(byProject.get(key) ?? []), c]);
  }
  const tiles: [number, string][] = [
    [yesterday.totals.toDone, "to Done"],
    [yesterday.totals.toImplemented, "to Implemented"],
    [yesterday.totals.sessionsEnded, "sessions closed"],
  ];
  return (
    <Section id="today-yesterday" title={`Yesterday · ${yesterday.date}`} hint="What moved, across all projects.">
      <div className="mb-2 grid grid-cols-3 gap-2">
        {tiles.map(([n, label]) => (
          <div key={label} className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1.5">
            <div className="text-lg font-medium tabular-nums">{n}</div>
            <div className="text-[11.5px] text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
      {byProject.size === 0 ? (
        <p className="text-[12.5px] text-zinc-500">No status changes recorded yesterday.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...byProject.entries()].map(([project, changes]) => (
            <li key={project}>
              <p className="text-[12.5px] font-medium">{project}</p>
              <ul className="ml-3 space-y-0.5">
                {changes.map((c, i) => (
                  <li key={`${c.taskId}-${i}`} className="flex gap-2 text-[12.5px]">
                    <Link to={`/tasks/${encodeURIComponent(c.taskId)}`} className="font-mono text-[12px] underline">
                      {c.taskId}
                    </Link>
                    <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{c.title ?? ""}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-zinc-500">
                      {c.from} → {c.to}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Focus({ focus }: { focus: FocusEntry[] }): React.JSX.Element {
  const active = focus
    .filter((f) => f.tier !== "cold" && f.focus)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.projectId.localeCompare(b.projectId));
  const cold = focus.filter((f) => f.tier === "cold" || !f.focus);
  return (
    <Section id="today-focus" title="Focus · all projects" hint="Each project's /choda-task-focus, side by side.">
      <ul className="space-y-1.5">
        {active.map((f) => (
          <li
            key={f.projectId}
            data-testid={`today-focus-${f.projectId}`}
            className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="font-medium">{f.projectId}</span>
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                {TIER_LABEL[f.tier]}
              </span>
              <Link to={`/tasks/${encodeURIComponent(f.focus!.id)}`} className="font-mono text-[12px] underline">
                {f.focus!.id}
              </Link>
              <span className="min-w-0 truncate">{f.focus!.title}</span>
              {f.also.length > 0 && <span className="ml-auto text-[11px] text-zinc-500">+{f.also.length} also</span>}
            </div>
            {f.focus!.blockedBy.length > 0 && (
              <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">Blocked by {f.focus!.blockedBy.join(", ")}</p>
            )}
            {f.resume && <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-300">{f.resume.resumePoint}</p>}
          </li>
        ))}
      </ul>
      {cold.length > 0 && (
        <p data-testid="today-focus-cold" className="mt-2 text-[12px] text-zinc-500">
          {plural(cold.length, "project")} with no focus: {cold.map((f) => f.projectId).join(", ")}
        </p>
      )}
    </Section>
  );
}

const byAt = (a: OutstandingItem, b: OutstandingItem): number =>
  a.at === b.at ? 0 : a.at === null ? 1 : b.at === null ? -1 : a.at.localeCompare(b.at);

function OutstandingRow({ project }: { project: DailyReport["outstanding"]["projects"][number] }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const name = projectName(project.projectId);
  const parts = COUNT_LABEL.filter(([k]) => project.counts[k] > 0).map(([k, label]) => `${project.counts[k]} ${label}`);
  return (
    <li data-testid={`today-outstanding-${name}`} className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-1 py-2 text-left text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <i className={`ti ${open ? "ti-chevron-down" : "ti-chevron-right"} text-zinc-400`} aria-hidden="true" />
        <span className="font-medium">{name}</span>
        <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{parts.join(" · ")}</span>
        {project.oldestAt && (
          <span className="ml-auto shrink-0 text-[11px] text-zinc-500">since {project.oldestAt.slice(0, 10)}</span>
        )}
      </button>
      {open && (
        <ul data-testid={`today-outstanding-items-${name}`} className="mb-2 ml-7 space-y-0.5">
          {[...project.items].sort(byAt).map((i, idx) => (
            <li key={`${i.kind}-${i.id}-${idx}`} className="flex gap-2 text-[12.5px]">
              <span className="w-40 shrink-0 text-[11.5px] text-zinc-500">{i.kind}</span>
              <span className="font-mono text-[12px]">{i.id}</span>
              <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{i.title}</span>
              {i.at && <span className="ml-auto shrink-0 text-[11px] text-zinc-500">{i.at.slice(0, 10)}</span>}
            </li>
          ))}
          {project.counts.rawInbox > 0 && (
            <li className="text-[11.5px] text-zinc-500">{plural(project.counts.rawInbox, "raw inbox item")} — triage in the inbox</li>
          )}
        </ul>
      )}
    </li>
  );
}

function Outstanding({ outstanding }: { outstanding: DailyReport["outstanding"] }): React.JSX.Element {
  return (
    <Section
      id="today-outstanding"
      title="Outstanding · all projects"
      hint="Open a project to see each item, oldest first."
    >
      {outstanding.projects.length === 0 ? (
        <p className="text-[12.5px] text-zinc-500">Nothing outstanding in any scanned workspace.</p>
      ) : (
        <ul>
          {outstanding.projects.map((p) => (
            <OutstandingRow key={p.projectId ?? "none"} project={p} />
          ))}
        </ul>
      )}
    </Section>
  );
}

export function TodayView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { report, isLoading, isError, answeredWithError, rescan, isFetching } = useDailyReport();

  function body(): React.JSX.Element {
    // An unanswered request is "unreachable", never an empty day (ErrorState, ADR-028).
    // An adapter that answered with an error (an older one without /daily-report)
    // is "failed": the laptop is there, this one report is not.
    if (health.conn === "disconnected") return <ErrorState variant="unreachable" />;
    if (isError && answeredWithError) return <ErrorState variant="failed" subject="today's report" />;
    if (isError) return <ErrorState variant="unreachable" />;
    if (isLoading || !report) return <Skeleton shape="list" label="Scanning every project…" />;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
        <section aria-label="Coverage">
          <Coverage coverage={report.coverage} />
        </section>
        <Yesterday yesterday={report.yesterday} />
        <Focus focus={report.today.focus} />
        <Outstanding outstanding={report.outstanding} />
      </div>
    );
  }

  return (
    <section aria-label="today" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-medium">Today</h1>
        <span className="text-xs text-zinc-400">
          {report ? `${report.date} · a day runs 05:00 → 05:00` : "yesterday, every project's focus, what is left"}
        </span>
        <button
          type="button"
          onClick={rescan}
          disabled={isFetching}
          className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          <i className="ti ti-refresh mr-1" aria-hidden="true" />
          Rescan
        </button>
      </div>
      {body()}
    </section>
  );
}
