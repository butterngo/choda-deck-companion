// TASK-2153 — the four success metrics from the TASK-2149 discovery, one per-day
// trend each, over GET /activity/digests (TASK-2152). The digests are written by
// `choda-deck activity digest` (TASK-2151); this view never computes a metric.
//
// Charts are the shared Trend (components/Trend.tsx); the per-day table below
// is the table view.

import { useOutletContext } from "react-router-dom";
import type { ActivityDigest } from "../api";
import type { HealthView } from "../hooks/use-health";
import { useActivity } from "../hooks/use-activity";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";
import { Trend } from "../components/Trend";
import { WeekCompare } from "../components/WeekCompare";

interface Metric {
  key: string;
  title: string;
  hint: string;
  value: (d: ActivityDigest) => number;
  format: (v: number, d: ActivityDigest) => string;
}

const METRICS: Metric[] = [
  {
    key: "shipped",
    title: "Shipped",
    hint: "completed sessions + commits on default branches · higher is better",
    value: (d) => d.metrics.sessionsCompleted + d.metrics.mergesToDefault,
    format: (v) => String(v),
  },
  {
    key: "confirmation",
    title: "Confirmation turns",
    hint: "share of prompts that only confirm · lower is better",
    value: (d) => d.metrics.confirmationRate * 100,
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: "wait",
    title: "Waiting on Claude",
    hint: "minutes a run was going and nothing else was typed · lower is better",
    value: (d) => d.metrics.waitMinutes,
    format: (v, d) => `${Math.round(v)} of ${d.metrics.activeMinutes} min`,
  },
  {
    key: "switches",
    title: "Context switches",
    hint: "workspace changes per active hour · lower is better",
    value: (d) => d.metrics.switchesPerActiveHour,
    format: (v) => `${v.toFixed(1)}/h`,
  },
];

function DayTable({ digests }: { digests: ActivityDigest[] }): React.JSX.Element {
  const th = "px-2.5 py-1.5 text-left font-medium text-zinc-500";
  const td = "px-2.5 py-1.5 tabular-nums";
  return (
    <table data-testid="activity-table" className="w-full text-[12.5px]">
      <thead className="border-b border-zinc-200 dark:border-zinc-800">
        <tr>
          <th className={th}>Date</th>
          <th className={th}>Prompts</th>
          <th className={th}>Active min</th>
          <th className={th}>Waiting min</th>
          <th className={th}>Switches</th>
          <th className={th}>Unattributed prompts</th>
        </tr>
      </thead>
      <tbody>
        {digests.map((d) => (
          <tr key={d.date} data-testid={`activity-row-${d.date}`} className="border-b border-zinc-100 dark:border-zinc-800/60">
            <td className={`${td} font-mono`}>{d.date}</td>
            <td className={td}>{d.metrics.prompts}</td>
            <td className={td}>{d.metrics.activeMinutes}</td>
            <td className={td}>{Math.round(d.metrics.waitMinutes)}</td>
            <td className={td}>{d.metrics.projectSwitches}</td>
            <td className={td}>{d.metrics.unresolvedPrompts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActivityView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { digests, isLoading, isError } = useActivity();
  const ordered = [...digests].sort((a, b) => a.date.localeCompare(b.date));

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      return <ErrorState variant="unreachable" description="Activity is unavailable — this is not an empty history." />;
    }
    if (isError) return <ErrorState variant="failed" subject="activity digests" />;
    if (isLoading) return <Skeleton shape="list" label="Loading activity…" />;
    if (ordered.length === 0) {
      return (
        <EmptyState
          icon="ti-activity"
          title="No digests yet"
          description="Run choda-deck activity digest --catch-up to write the last week's digests, or wait for the daily scheduled run."
        />
      );
    }
    return (
      <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
        {/* TASK-2386 — the one line that says whether things got better. */}
        <WeekCompare digests={ordered} />
        <div data-testid="activity-trends" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {METRICS.map((m) => (
            <Trend
              key={m.key}
              testId={`trend-${m.key}`}
              title={m.title}
              hint={m.hint}
              points={ordered.map((d) => ({ date: d.date, value: m.value(d), label: m.format(m.value(d), d) }))}
            />
          ))}
        </div>
        <div>
          <h2 className="mb-2 text-[11px] uppercase tracking-wide text-zinc-400">Per day</h2>
          <DayTable digests={ordered} />
        </div>
      </div>
    );
  }

  return (
    <section aria-label="activity" className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-baseline gap-2 mb-4">
        <h1 className="text-lg font-medium">Activity</h1>
        <span className="text-xs text-zinc-400">daily Claude work, last 30 days</span>
      </div>
      {body()}
      {health.conn === "stale" && <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>}
    </section>
  );
}
