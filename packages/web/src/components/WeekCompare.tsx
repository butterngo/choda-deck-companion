// TASK-2386 — "Tuần này vs tuần trước" at the top of the Activity screen.
//
// Four charts with no explanation were the Activity view Butter could not read
// ("tôi nhìn vào cái activities tôi không hiểu gì hết", 2026-10-11). This line
// says, for each of his four metrics, this week against last week, an arrow, and
// whether that arrow is good — in words, not only in colour.
//
// This week = the 7 most recent digests; last week = the up to 7 before them.
// With fewer than 8 digests there is no last week to compare, so nothing renders.

import type { ActivityDigest } from "../api";

export interface WeekMetric {
  key: "shipped" | "confirmation" | "waiting" | "switches";
  label: string;
  better: "higher" | "lower";
  thisWeek: number;
  lastWeek: number;
  format: (v: number) => string;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0);

/** Pure: null when there is no previous week to compare against. */
export function weekCompare(digests: ActivityDigest[]): WeekMetric[] | null {
  const ordered = [...digests].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 8) return null;
  const now = ordered.slice(-7);
  const before = ordered.slice(-14, -7);
  const m = (ds: ActivityDigest[]) => ({
    shipped: sum(ds.map((d) => d.metrics.sessionsCompleted + d.metrics.mergesToDefault)),
    confirmation: mean(ds.map((d) => d.metrics.confirmationRate * 100)),
    waiting:
      (100 * sum(ds.map((d) => d.metrics.waitMinutes))) /
      Math.max(1, sum(ds.map((d) => d.metrics.activeMinutes))),
    switches: mean(ds.map((d) => d.metrics.switchesPerActiveHour)),
  });
  const a = m(now);
  const b = m(before);
  return [
    { key: "shipped", label: "Shipped", better: "higher", thisWeek: a.shipped, lastWeek: b.shipped, format: (v) => String(Math.round(v)) },
    { key: "confirmation", label: "Câu chỉ để xác nhận", better: "lower", thisWeek: a.confirmation, lastWeek: b.confirmation, format: (v) => `${Math.round(v)}%` },
    { key: "waiting", label: "Thời gian chờ Claude", better: "lower", thisWeek: a.waiting, lastWeek: b.waiting, format: (v) => `${Math.round(v)}%` },
    { key: "switches", label: "Nhảy project", better: "lower", thisWeek: a.switches, lastWeek: b.switches, format: (v) => `${v.toFixed(1)}/h` },
  ];
}

export function WeekCompare({ digests }: { digests: ActivityDigest[] }): React.JSX.Element | null {
  const rows = weekCompare(digests);
  if (!rows) return null;
  return (
    <section data-testid="week-compare" className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3.5 py-3">
      <h2 className="mb-2 text-sm font-medium">Tuần này vs tuần trước</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const delta = r.thisWeek - r.lastWeek;
          const same = Math.abs(delta) < 1e-9;
          const good = !same && (r.better === "higher" ? delta > 0 : delta < 0);
          const arrow = same ? "→" : delta > 0 ? "↑" : "↓";
          return (
            <li key={r.key} data-testid={`week-${r.key}`} className="text-[12.5px]">
              <div className="text-zinc-500">{r.label}</div>
              <div className="tabular-nums">
                <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">{r.format(r.thisWeek)}</span>{" "}
                <span
                  data-testid={`week-${r.key}-arrow`}
                  className={same ? "text-zinc-400" : good ? "text-emerald-600" : "text-red-600"}
                >
                  {arrow}
                </span>{" "}
                <span className="text-zinc-400">tuần trước {r.format(r.lastWeek)}</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                {r.better === "higher" ? "cao hơn là tốt" : "thấp hơn là tốt"}
                {same ? "" : good ? " · đang tốt lên" : " · đang xấu đi"}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
