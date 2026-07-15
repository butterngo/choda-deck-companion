// TASK-1216 — the chronological sync activity feed, implementing the design
// pulled from the Choda Design System project (docs/design/task-1216-sync-activity-log.md).
// Presentational + local filter state: tests drive it with mocked events.
// Honesty rule: conflict rows are visually distinct (red left border + tint) —
// a dropped op is never blended into a normal pull row.

import { useState } from "react";
import type { SyncEvent } from "../api";

type Kind = SyncEvent["kind"];
type Filter = "all" | Kind;

const FILTERS: readonly Filter[] = ["all", "pull", "push", "drain", "conflict"];

// Kind styling per the design: icon tile bg + stroke, badge tint. Lucide-style
// inline SVGs (arrow-down, arrow-up, archive, alert-triangle) — no icon dep.
const KIND: Record<
  Kind,
  { label: string; tile: string; stroke: string; badge: string; path: React.JSX.Element }
> = {
  pull: {
    label: "pull",
    tile: "bg-sky-100 dark:bg-sky-950/50",
    stroke: "text-sky-700 dark:text-sky-400",
    badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
    path: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </>
    ),
  },
  push: {
    label: "push",
    tile: "bg-emerald-100 dark:bg-emerald-950/50",
    stroke: "text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    path: (
      <>
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </>
    ),
  },
  drain: {
    label: "drain",
    tile: "bg-zinc-100 dark:bg-zinc-800",
    stroke: "text-zinc-600 dark:text-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    path: (
      <>
        <rect x="3" y="3" width="18" height="5" rx="1" />
        <path d="M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </>
    ),
  },
  conflict: {
    label: "conflict",
    tile: "bg-rose-100 dark:bg-rose-950/50",
    stroke: "text-rose-700 dark:text-rose-400",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
    path: (
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
};

export function relTime(at: number, now: number = Date.now()): string {
  const d = now - at;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function absTime(at: number): string {
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function KindIcon({ kind }: { kind: Kind }): React.JSX.Element {
  const k = KIND[kind];
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${k.tile}`}
      aria-hidden="true"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={k.stroke}
      >
        {k.path}
      </svg>
    </span>
  );
}

function Counts({ ev }: { ev: SyncEvent }): React.JSX.Element {
  const chips: React.JSX.Element[] = [];
  if (ev.upserted > 0)
    chips.push(
      <span key="u" className="mono rounded px-1.5 text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        +{ev.upserted}
      </span>,
    );
  if (ev.tombstoned > 0)
    chips.push(
      <span key="t" className="mono rounded px-1.5 text-[11px] bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
        −{ev.tombstoned}
      </span>,
    );
  if (ev.pushed > 0)
    chips.push(
      <span key="p" className="mono rounded px-1.5 text-[11px] bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
        ↑{ev.pushed}
      </span>,
    );
  if (ev.conflicts > 0)
    chips.push(
      <span key="c" className="mono rounded px-1.5 text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
        {ev.conflicts} conflict{ev.conflicts > 1 ? "s" : ""}
      </span>,
    );
  if (chips.length === 0)
    chips.push(
      <span key="n" className="mono text-[11px] text-zinc-400 dark:text-zinc-500">
        no changes
      </span>,
    );
  return <span className="flex flex-wrap items-center gap-1">{chips}</span>;
}

export function SyncLogFeed({
  events,
  isLoading,
  isError,
}: {
  events: SyncEvent[];
  isLoading: boolean;
  isError: boolean;
}): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = filter === "all" ? events : events.filter((e) => e.kind === filter);
  const conflictTotal = events.filter((e) => e.kind === "conflict").length;

  return (
    <section
      aria-label="sync activity"
      className="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <span className="mono text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Sync activity
        </span>
        {conflictTotal > 0 && (
          <span
            data-conflict-badge="true"
            className="mono rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
          >
            {conflictTotal} conflict{conflictTotal > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            data-filter={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`mono rounded border px-2.5 py-0.5 text-[11px] font-medium capitalize ${
              filter === f
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {f === "conflict" && conflictTotal > 0 ? `conflicts (${conflictTotal})` : f}
          </button>
        ))}
      </div>

      {isError ? (
        <p role="alert" className="px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          Failed to load sync activity — the feed is unavailable. (Not “no events”.)
        </p>
      ) : isLoading ? (
        <p className="px-4 py-3 text-sm text-zinc-500">Loading sync activity…</p>
      ) : events.length === 0 ? (
        <p data-empty="true" className="px-4 py-8 text-center text-sm text-zinc-500">
          No sync activity yet — pull, push, drain, and conflict events will show up here.
        </p>
      ) : filtered.length === 0 ? (
        <p data-empty="filtered" className="px-4 py-6 text-center text-sm text-zinc-500">
          No {filter} events recorded.
        </p>
      ) : (
        <ol className="list-none m-0 p-0">
          {filtered.map((ev) => {
            const conflict = ev.kind === "conflict";
            return (
              <li
                key={ev.id}
                data-kind={ev.kind}
                className={`flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 border-zinc-100 dark:border-zinc-800/60 border-l-2 ${
                  conflict
                    ? "border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/20"
                    : "border-l-transparent"
                }`}
              >
                <KindIcon kind={ev.kind} />
                <span
                  title={absTime(ev.at)}
                  className="mono mt-1.5 min-w-16 whitespace-nowrap text-[11px] text-zinc-400 dark:text-zinc-500"
                >
                  {relTime(ev.at)}
                </span>
                <span
                  className={`mono mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${KIND[ev.kind].badge}`}
                >
                  {KIND[ev.kind].label}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                  <Counts ev={ev} />
                  {ev.note && (
                    <span
                      className={`text-xs italic ${
                        conflict ? "text-rose-800 dark:text-rose-300" : "text-zinc-500"
                      }`}
                    >
                      {ev.note}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
