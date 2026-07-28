// TASK-1444 — polls the full-graph read (GET /graph/edges?projectId=, TASK-1443)
// for the visual GraphView. Same cadence as the other pillar screens so the
// strips move together. Disabled until a projectId is known — never fetches with
// an empty id.

import { useQuery } from "@tanstack/react-query";
import { fetchFullGraph, type FullGraph } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface FullGraphView {
  data: FullGraph | null;
  isLoading: boolean;
  isError: boolean;
}

export function useFullGraph(projectId: string | null): FullGraphView {
  const q = useQuery({
    queryKey: ["graph", "full", projectId],
    queryFn: ({ signal }) => fetchFullGraph(projectId as string, signal),
    enabled: projectId !== null && projectId.length > 0,
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    data: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
