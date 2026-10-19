// TASK-2538 — the "Flow" block of a run on the Runs screen: the goal's items as
// boxes, left to right in dependency order, one edge per blocker inside the
// goal (`deps`, TASK-2535). Agreed mockup:
// https://claude.ai/artifact/XG9UJ3bPmQERJaaZTaf8uM
//
// A column is the item's dependency depth: no deps → column 0, otherwise one
// past its deepest dep. That puts the critical path on screen without a layout
// library. A cycle should not exist (/choda-plan refuses them), but if one does
// its members land in column 0 instead of recursing forever.

import { useNavigate } from "react-router-dom";
import type { RunItem } from "../api";

type BoxState = "done" | "in-progress" | "ready" | "waiting";

const W = 92;
const H = 28;
const COL_X = 138;
const ROW_Y = 38;
const TOP = 22;
const LEFT = 4;

const DONE = ["IMPLEMENTED", "DONE"];

export function boxState(item: RunItem, byId: Map<string, RunItem>): BoxState {
  if (DONE.includes(item.status)) return "done";
  if (item.activeSince || item.status === "IN-PROGRESS") return "in-progress";
  const depsDone = item.deps.every((d) => {
    const dep = byId.get(d);
    return dep !== undefined && DONE.includes(dep.status);
  });
  return depsDone ? "ready" : "waiting";
}

/** Dependency depth per item; members of a cycle get 0. */
export function depths(items: RunItem[]): Map<string, number> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = out.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return -1;
    visiting.add(id);
    const deps = (byId.get(id)?.deps ?? []).filter((d) => byId.has(d)).map(depth);
    visiting.delete(id);
    const d = deps.includes(-1) || deps.length === 0 ? 0 : 1 + Math.max(...deps);
    out.set(id, d);
    return d;
  };
  for (const i of items) depth(i.id);
  return out;
}

const BOX_CLS: Record<BoxState, { rect: string; text: string; mark: string }> = {
  done: { rect: "fill-emerald-50 stroke-emerald-300 dark:fill-emerald-950 dark:stroke-emerald-700", text: "fill-emerald-700 dark:fill-emerald-300", mark: "✓" },
  "in-progress": { rect: "fill-blue-50 stroke-blue-600 dark:fill-blue-950 dark:stroke-blue-400", text: "fill-blue-700 dark:fill-blue-300", mark: "●" },
  ready: { rect: "fill-white stroke-zinc-500 dark:fill-zinc-950 dark:stroke-zinc-400", text: "fill-zinc-600 dark:fill-zinc-300", mark: "next" },
  waiting: { rect: "fill-white stroke-zinc-300 dark:fill-zinc-950 dark:stroke-zinc-700", text: "fill-zinc-400", mark: "" },
};

export function RunFlow({ items }: { items: RunItem[] }): React.JSX.Element | null {
  const navigate = useNavigate();
  if (items.length === 0) return null;

  const byId = new Map(items.map((i) => [i.id, i]));
  const depth = depths(items);
  const cols: RunItem[][] = [];
  for (const i of items) (cols[depth.get(i.id) ?? 0] ??= []).push(i);
  const rows = Math.max(...cols.map((c) => c?.length ?? 0));
  const width = LEFT + (cols.length - 1) * COL_X + W + 6;
  const height = TOP + rows * ROW_Y + 2;

  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((col, x) => {
    const offset = ((rows - (col?.length ?? 0)) * ROW_Y) / 2;
    col?.forEach((i, y) => pos.set(i.id, { x: LEFT + x * COL_X, y: TOP + offset + y * ROW_Y }));
  });

  const open = (id: string): void => {
    void navigate(`/tasks/${encodeURIComponent(id)}`, { state: { from: { to: "/runs", label: "Runs" } } });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <i className="ti ti-route text-zinc-400" aria-hidden="true" />
        Flow
        <span className="font-normal text-zinc-400">left to right in dependency order · click a box for its task</span>
        <span className="ml-auto flex flex-wrap gap-3 font-normal text-zinc-400">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-50 align-[-1px]" />done</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-blue-600 bg-blue-50 align-[-1px]" />in progress</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-zinc-500 align-[-1px]" />ready next</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-zinc-300 align-[-1px]" />waiting on a blocker</span>
        </span>
      </h4>
      <div className="overflow-x-auto pb-1">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dependency flow" className="block">
          {cols.map((_, x) => (
            <text key={x} x={LEFT + x * COL_X} y={12} className="fill-zinc-400 text-[10.5px] tracking-wide">
              {x === 0 ? "No blockers" : `Step ${x + 1}`}
            </text>
          ))}
          {items.flatMap((i) =>
            i.deps
              .filter((d) => pos.has(d))
              .map((d) => {
                const a = pos.get(d)!;
                const b = pos.get(i.id)!;
                const x1 = a.x + W;
                const y1 = a.y + H / 2;
                const x2 = b.x;
                const y2 = b.y + H / 2;
                const mx = (x1 + x2) / 2;
                const done = DONE.includes(byId.get(d)?.status ?? "");
                return (
                  <path
                    key={`${d}-${i.id}`}
                    data-edge={`${d}->${i.id}`}
                    d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    className={`fill-none stroke-[1.4] ${done ? "stroke-emerald-300 dark:stroke-emerald-700" : "stroke-zinc-300 dark:stroke-zinc-700"}`}
                  />
                );
              }),
          )}
          {items.map((i) => {
            const p = pos.get(i.id)!;
            const state = boxState(i, byId);
            const cls = BOX_CLS[state];
            return (
              <g
                key={i.id}
                data-box={i.id}
                data-col={depth.get(i.id) ?? 0}
                data-state={state}
                role="link"
                tabIndex={0}
                aria-label={`${i.id} ${i.title}`}
                onClick={() => open(i.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(i.id);
                }}
                className="cursor-pointer"
              >
                <title>{`${i.id} · ${i.title}`}</title>
                <rect
                  x={p.x}
                  y={p.y}
                  width={W}
                  height={H}
                  rx={6}
                  strokeWidth={1.5}
                  strokeDasharray={state === "ready" ? "3 2" : undefined}
                  className={cls.rect}
                />
                <text x={p.x + 10} y={p.y + 18} className={`font-mono text-[11px] ${cls.text}`}>
                  {i.id.replace(/^TASK-/, "")}
                </text>
                <text x={p.x + W - 10} y={p.y + 18} textAnchor="end" className={`text-[11px] ${cls.text}`}>
                  {cls.mark}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
