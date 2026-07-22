// TASK-1174 AC-4 — task↔ADR↔conversation edges for the selected node. List
// form (visual graph is optional per the task body).

import { useGraphEdges } from "../hooks/use-graph-edges";

export function GraphEdgesList({ nodeId }: { nodeId: string }): React.JSX.Element {
  const { edges, isLoading, isError } = useGraphEdges(nodeId);

  if (isError) {
    return <p className="text-sm text-zinc-500">Couldn’t load edges.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading edges…</p>;
  }
  if (edges.length === 0) {
    return <p className="text-sm text-zinc-500">No linked edges.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-label="graph edges">
      {edges.map((e, i) => (
        <li key={`${e.fromId}-${e.type}-${e.toId}-${i}`} className="text-zinc-600 dark:text-zinc-300">
          {e.fromId} <span className="text-zinc-400">{e.type.toLowerCase()}</span> {e.toId}
        </li>
      ))}
    </ul>
  );
}
