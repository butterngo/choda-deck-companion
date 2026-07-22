// TASK-1174 AC-4 — task↔ADR↔conversation edges for the selected entry/task.
// List form for v1 (visual graph is optional per the task body).

import { useQuery } from "@tanstack/react-query";
import { fetchGraphEdges, type GraphEdge } from "../api";

export interface GraphEdgesView {
  edges: GraphEdge[];
  isLoading: boolean;
  isError: boolean;
}

export function useGraphEdges(nodeId: string | null): GraphEdgesView {
  const q = useQuery({
    queryKey: ["graph", "edges", nodeId],
    queryFn: ({ signal }) => fetchGraphEdges(nodeId as string, "both", signal),
    enabled: nodeId !== null,
    staleTime: 0,
  });
  return {
    edges: q.data?.edges ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
