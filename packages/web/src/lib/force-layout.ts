// TASK-1444 AC-2 — ported from `scripts/export-graph.mjs` in the main choda-deck
// repo (the hand-rolled, dependency-free SVG force layout in its renderHtml()
// tick() loop). We reuse that exact repulsion / spring / centering math rather
// than adding a graph-viz dependency (react-flow / d3 / cytoscape / vis-network),
// consistent with export-graph.mjs's own no-CDN / no-heavy-dep rationale.
//
// Two deliberate differences from the source:
//   1. The script animates in the browser via requestAnimationFrame; here we run
//      a fixed iteration budget synchronously to a settled layout so React can
//      render a static SVG — and so the result is deterministic + unit-testable.
//   2. Initial placement is a deterministic ring-by-index, NOT Math.random(), so
//      the same graph always lays out the same way (stable tests, no flicker).

export interface LayoutEdge {
  fromId: string;
  toId: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface ForceLayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
}

interface Body extends Point {
  id: string;
  vx: number;
  vy: number;
}

export const DEFAULT_LAYOUT: Required<ForceLayoutOptions> = {
  width: 900,
  height: 600,
  iterations: 300,
};

// Run the force simulation to a settled state. Returns a position per node id.
// O(iterations · n²) — callers must cap the node count (see GRAPH_NODE_CEILING)
// before handing a huge set in, or the tab would hang (AC-8).
export function computeForceLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
  options: ForceLayoutOptions = {},
): Map<string, Point> {
  const { width, height, iterations } = { ...DEFAULT_LAYOUT, ...options };
  const cx = width / 2;
  const cy = height / 2;
  const n = nodeIds.length;
  const radius = Math.min(width, height) * 0.35;

  // Deterministic ring seed (was Math.random() in the source).
  const bodies: Body[] = nodeIds.map((id, i) => {
    const ang = (i / Math.max(1, n)) * Math.PI * 2;
    return { id, x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius, vx: 0, vy: 0 };
  });
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const links = edges
    .map((e) => ({ s: byId.get(e.fromId), t: byId.get(e.toId) }))
    .filter((l): l is { s: Body; t: Body } => l.s !== undefined && l.t !== undefined);

  let alpha = 1;
  for (let it = 0; it < iterations; it++) {
    alpha *= 0.985;
    // Repulsion between every pair + a gentle pull toward centre.
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2);
        const f = 2600 / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      a.vx += (cx - a.x) * 0.0016;
      a.vy += (cy - a.y) * 0.0016;
    }
    // Springs along edges (rest length 90).
    for (const l of links) {
      const dx = l.t.x - l.s.x;
      const dy = l.t.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - 90) * 0.02;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      l.s.vx += fx;
      l.s.vy += fy;
      l.t.vx -= fx;
      l.t.vy -= fy;
    }
    for (const p of bodies) {
      p.x += p.vx * alpha;
      p.y += p.vy * alpha;
      p.vx *= 0.82;
      p.vy *= 0.82;
    }
  }

  return new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
}
