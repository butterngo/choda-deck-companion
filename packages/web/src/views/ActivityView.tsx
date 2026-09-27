// TASK-2153 — the four success metrics from the TASK-2149 discovery, one per-day
// trend each, over GET /activity/digests (TASK-2152). The digests are written by
// `choda-deck activity digest` (TASK-2151); this view never computes a metric.
//
// Charts follow the dataviz method: one series per chart, one axis, one hue,
// 2px line, 8px markers with a surface ring, a hover readout per point, and the
// per-day table below as the table view. Single series, so the title names it
// and there is no legend.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { ActivityDigest } from "../api";
import type { HealthView } from "../hooks/use-health";
import { useActivity } from "../hooks/use-activity";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

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

const W = 320;
const H = 96;
const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;

function Trend({ metric, digests }: { metric: Metric; digests: ActivityDigest[] }): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const values = digests.map(metric.value);
  const max = Math.max(...values, 0) || 1;
  const x = (i: number): number =>
    digests.length === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (digests.length - 1);
  const y = (v: number): number => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const latest = digests[digests.length - 1];
  const shown = hover ?? digests.length - 1;
  const shownDigest = digests[shown];

  return (
    <figure
      data-testid={`trend-${metric.key}`}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3.5 py-3"
    >
      <figcaption className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{metric.title}</span>
        {latest !== undefined && (
          <span className="ml-auto text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
            {metric.format(metric.value(latest), latest)}
          </span>
        )}
      </figcaption>
      <p className="mt-0.5 text-[11.5px] text-zinc-500">{metric.hint}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full h-24 overflow-visible"
        role="img"
        aria-label={`${metric.title} per day`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP} y2={y(0)} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />
        )}
        {digests.length > 1 && (
          <polyline
            points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-blue-600 dark:stroke-blue-400"
          />
        )}
        {values.map((v, i) => (
          <g key={digests[i]?.date ?? i} data-testid="trend-point" onMouseEnter={() => setHover(i)}>
            <circle cx={x(i)} cy={y(v)} r={4} strokeWidth={2} className="fill-blue-600 dark:fill-blue-400 stroke-white dark:stroke-zinc-950" />
            <circle cx={x(i)} cy={y(v)} r={12} fill="transparent">
              <title>{`${digests[i]?.date}: ${digests[i] ? metric.format(v, digests[i]) : v}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex text-[11px] tabular-nums text-zinc-400">
        <span>{digests[0]?.date}</span>
        {shownDigest !== undefined && hover !== null && (
          <span className="mx-auto text-zinc-600 dark:text-zinc-300">
            {shownDigest.date} · {metric.format(metric.value(shownDigest), shownDigest)}
          </span>
        )}
        {digests.length > 1 && <span className="ml-auto">{latest?.date}</span>}
      </div>
    </figure>
  );
}

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
        <div data-testid="activity-trends" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {METRICS.map((m) => (
            <Trend key={m.key} metric={m} digests={ordered} />
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
