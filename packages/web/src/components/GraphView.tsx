// TASK-1444 — the visual knowledge graph the Knowledge tab has been missing
// (TASK-1174 AC-4 deferred it). Renders nodes + edges from the full-graph read
// (TASK-1443) with a force-directed layout ported from scripts/export-graph.mjs
// (see lib/force-layout.ts) — no new graph-viz npm dependency (AC-1, AC-2).
//
// Interactivity (AC-4): pan (drag background) + zoom (wheel / buttons). Node
// drag + click-to-focus are DEFERRED — the static settled layout is navigable
// enough for v1; the source script's live drag/reheat isn't ported.

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode, GraphNodeType } from "../api";
import { computeForceLayout, DEFAULT_LAYOUT } from "../lib/force-layout";

// AC-8 — documented v1 node-count ceiling. Beyond it the O(n²) layout would
// hang the tab, so we render only the highest-degree GRAPH_NODE_CEILING nodes
// and warn that the view is truncated (graceful degradation, never a freeze).
// 300 is comfortably above this project's real relationship-graph size measured
// off TASK-1443; raise it only with a fresh measurement.
export const GRAPH_NODE_CEILING = 300;

const NODE_COLOR: Record<GraphNodeType, string> = {
  task: "#4E79A7",
  knowledge: "#76B7B2",
  code_ref: "#B07AA1",
};
const NODE_LABEL: Record<GraphNodeType, string> = {
  task: "Task",
  knowledge: "Knowledge",
  code_ref: "Code ref",
};
const nodeColor = (t: string): string => NODE_COLOR[t as GraphNodeType] ?? "#888";

interface View {
  x: number;
  y: number;
  k: number;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxNodes?: number;
}

export function GraphView({ nodes, edges, maxNodes = GRAPH_NODE_CEILING }: GraphViewProps): React.JSX.Element {
  const typeById = useMemo(() => {
    const m = new Map<string, GraphNodeType>();
    for (const n of nodes) m.set(n.id, n.type);
    return m;
  }, [nodes]);

  // Only nodes that appear in an edge are drawn (an isolated task is not a
  // relationship) — mirrors export-graph.mjs. Degree drives radius + the ceiling
  // sort.
  const { drawIds, drawEdges, degree, capped } = useMemo(() => {
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.fromId, (deg.get(e.fromId) ?? 0) + 1);
      deg.set(e.toId, (deg.get(e.toId) ?? 0) + 1);
    }
    let ids = [...deg.keys()];
    let cappedInfo: { shown: number; total: number } | null = null;
    if (ids.length > maxNodes) {
      ids = [...ids].sort((a, b) => (deg.get(b) ?? 0) - (deg.get(a) ?? 0)).slice(0, maxNodes);
      cappedInfo = { shown: ids.length, total: deg.size };
    }
    const keep = new Set(ids);
    const kept = edges.filter((e) => keep.has(e.fromId) && keep.has(e.toId));
    return { drawIds: ids, drawEdges: kept, degree: deg, capped: cappedInfo };
  }, [edges, maxNodes]);

  const layout = useMemo(
    () => computeForceLayout(drawIds, drawEdges),
    [drawIds, drawEdges],
  );

  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pan = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Wheel zoom needs a non-passive listener to preventDefault the page scroll —
  // React's onWheel is passive, so bind manually.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent): void => {
      ev.preventDefault();
      const s = ev.deltaY < 0 ? 1.1 : 0.9;
      const r = svg.getBoundingClientRect();
      const mx = ev.clientX - r.left;
      const my = ev.clientY - r.top;
      setView((v) => ({ x: mx - (mx - v.x) * s, y: my - (my - v.y) * s, k: v.k * s }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // AC-7 — no relationships is a first-class state, distinct from loading (view)
  // and disconnected (view). An empty node set here means the project has edges
  // nowhere, not a broken fetch.
  if (drawEdges.length === 0) {
    return (
      <div
        role="status"
        className="flex h-[480px] items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500"
      >
        No relationships yet — this project has no linked tasks, knowledge, or code refs to graph.
      </div>
    );
  }

  const presentTypes = [...new Set(drawIds.map((id) => typeById.get(id) ?? ("task" as GraphNodeType)))];

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>): void => {
    if ((ev.target as Element).closest("[data-node]")) return;
    pan.current = { px: ev.clientX, py: ev.clientY, ox: view.x, oy: view.y };
    (ev.currentTarget as SVGSVGElement).setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>): void => {
    const p = pan.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.ox + (ev.clientX - p.px), y: p.oy + (ev.clientY - p.py) }));
  };
  const onPointerUp = (): void => {
    pan.current = null;
  };
  const zoom = (factor: number): void => setView((v) => ({ ...v, k: v.k * factor }));
  const reset = (): void => setView({ x: 0, y: 0, k: 1 });

  return (
    <div className="flex flex-col gap-2">
      {capped && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          Large graph — showing the {capped.shown} most-connected of {capped.total} nodes. Zoom/pan to explore.
        </p>
      )}
      <div className="flex items-center gap-2 text-xs">
        <button type="button" onClick={() => zoom(1.2)} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">+</button>
        <button type="button" onClick={() => zoom(0.8)} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">−</button>
        <button type="button" onClick={reset} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">Reset view</button>
        <span className="ml-2 text-zinc-500">{drawIds.length} nodes · {drawEdges.length} edges</span>
        <span className="ml-auto flex items-center gap-3">
          {presentTypes.map((t) => (
            <span key={t} className="flex items-center gap-1 text-zinc-500">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: nodeColor(t) }} />
              {NODE_LABEL[t]}
            </span>
          ))}
        </span>
      </div>

      <svg
        ref={svgRef}
        aria-label="knowledge graph"
        viewBox={`0 0 ${DEFAULT_LAYOUT.width} ${DEFAULT_LAYOUT.height}`}
        className="h-[480px] w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 touch-none cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g>
            {drawEdges.map((e, i) => {
              const s = layout.get(e.fromId);
              const t = layout.get(e.toId);
              if (!s || !t) return null;
              return (
                <line
                  key={`${e.fromId}-${e.type}-${e.toId}-${i}`}
                  data-edge
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={hoveredEdge === i ? "#4E79A7" : "#9c9c9c"}
                  strokeOpacity={hoveredEdge === i ? 0.9 : 0.45}
                  strokeWidth={hoveredEdge === i ? 2 : 1.5}
                  onPointerEnter={() => setHoveredEdge(i)}
                  onPointerLeave={() => setHoveredEdge((h) => (h === i ? null : h))}
                >
                  <title>{`${e.fromId} ${e.type} ${e.toId}`}</title>
                </line>
              );
            })}
          </g>
          <g>
            {drawIds.map((id) => {
              const p = layout.get(id);
              if (!p) return null;
              const type = typeById.get(id) ?? ("task" as GraphNodeType);
              const r = 5 + Math.min(7, degree.get(id) ?? 0);
              const label = id.length > 26 ? `${id.slice(0, 25)}…` : id;
              return (
                <g key={id} data-node data-node-id={id} transform={`translate(${p.x} ${p.y})`}>
                  <circle r={r} fill={nodeColor(type)} stroke="currentColor" strokeWidth={1} className="text-zinc-50 dark:text-zinc-900">
                    <title>{`${NODE_LABEL[type]}: ${id}`}</title>
                  </circle>
                  <text x={r + 3} y={4} className="fill-zinc-600 dark:fill-zinc-300" style={{ fontSize: 10, pointerEvents: "none" }}>
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
        {hoveredEdge !== null && drawEdges[hoveredEdge] && (
          <text x={12} y={DEFAULT_LAYOUT.height - 12} className="fill-zinc-500" style={{ fontSize: 12 }}>
            {drawEdges[hoveredEdge].fromId} —{drawEdges[hoveredEdge].type}→ {drawEdges[hoveredEdge].toId}
          </text>
        )}
      </svg>
    </div>
  );
}
