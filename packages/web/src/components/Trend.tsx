// TASK-2153 — one per-day series as a small line chart, lifted out of
// ActivityView for TASK-2359 so the Improve tab draws the same chart rather
// than a second one that drifts.
//
// Dataviz method: one series, one axis, one hue, 2px line, 8px markers with a
// surface ring, a hover readout per point. Single series, so the title names it
// and there is no legend. `markers` draws a dashed vertical line on those dates
// (the Improve tab marks the days something shipped).

import { useState } from "react";

export interface TrendPoint {
  date: string;
  value: number;
  /** The value as a reader should see it, e.g. "207 of 460 min". */
  label: string;
}

const W = 320;
const H = 96;
const PAD_X = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;

export function Trend({
  testId,
  title,
  hint,
  points,
  markers = [],
}: {
  testId: string;
  title: string;
  hint?: string;
  points: TrendPoint[];
  markers?: string[];
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0) || 1;
  const x = (i: number): number =>
    points.length === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (points.length - 1);
  const y = (v: number): number => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);
  const latest = points[points.length - 1];
  const shown = hover !== null ? points[hover] : undefined;

  return (
    <figure
      data-testid={testId}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3.5 py-3"
    >
      <figcaption className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{title}</span>
        {latest !== undefined && (
          <span className="ml-auto text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
            {latest.label}
          </span>
        )}
      </figcaption>
      {hint && <p className="mt-0.5 text-[11.5px] text-zinc-500">{hint}</p>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full h-24 overflow-visible"
        role="img"
        aria-label={`${title} per day`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
        {points.map((p, i) =>
          markers.includes(p.date) ? (
            <line
              key={`m-${p.date}`}
              data-testid="trend-marker"
              x1={x(i)}
              x2={x(i)}
              y1={PAD_TOP}
              y2={y(0)}
              strokeDasharray="3 3"
              className="stroke-zinc-400 dark:stroke-zinc-500"
              strokeWidth={1}
            />
          ) : null,
        )}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP} y2={y(0)} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />
        )}
        {points.length > 1 && (
          <polyline
            points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-blue-600 dark:stroke-blue-400"
          />
        )}
        {points.map((p, i) => (
          <g key={p.date} data-testid="trend-point" onMouseEnter={() => setHover(i)}>
            <circle cx={x(i)} cy={y(p.value)} r={4} strokeWidth={2} className="fill-blue-600 dark:fill-blue-400 stroke-white dark:stroke-zinc-950" />
            <circle cx={x(i)} cy={y(p.value)} r={12} fill="transparent">
              <title>{`${p.date}: ${p.label}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex text-[11px] tabular-nums text-zinc-400">
        <span>{points[0]?.date}</span>
        {shown !== undefined && (
          <span className="mx-auto text-zinc-600 dark:text-zinc-300">
            {shown.date} · {shown.label}
          </span>
        )}
        {points.length > 1 && <span className="ml-auto">{latest?.date}</span>}
      </div>
    </figure>
  );
}
